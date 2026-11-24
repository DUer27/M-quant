#!/usr/bin/env python3
"""Executable factor exposure / expected-return mapping using local real observations.

The command consumes one JSON request on stdin and emits one JSON result on stdout.
Characteristic slopes are explicitly conditional associations, never structural prices
of risk. Economic risk-price interpretation is reserved for estimated risk exposures.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

VERSION = "return-mapping.v1"


def finite_float(value: Any) -> float | None:
    try:
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None


def json_clean(value: Any) -> Any:
    if isinstance(value, np.ndarray):
        return json_clean(value.tolist())
    if isinstance(value, dict):
        return {str(key): json_clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_clean(item) for item in value]
    if isinstance(value, (np.floating, float)):
        return finite_float(value)
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, (pd.Timestamp,)):
        return value.strftime("%Y-%m-%d")
    return value


def ols(y: np.ndarray, x: np.ndarray, weights: np.ndarray | None = None) -> dict[str, Any]:
    """Fit an intercept and full-rank slopes; fail explicitly on unidentified models."""
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float).reshape(-1)
    if x.ndim == 1:
        x = x[:, None]
    mask = np.isfinite(y) & np.isfinite(x).all(axis=1)
    if weights is not None:
        weights = np.asarray(weights, dtype=float)
        mask &= np.isfinite(weights) & (weights > 0)
    design = np.column_stack([np.ones(len(y)), x])[mask]
    yy = y[mask]
    if len(yy) <= design.shape[1]:
        raise ValueError("有效截面样本不足以识别截距和全部因子系数。")
    fit_design, fit_y = design, yy
    if weights is not None:
        root_weight = np.sqrt(weights[mask])
        fit_design = design * root_weight[:, None]
        fit_y = yy * root_weight
    rank = int(np.linalg.matrix_rank(fit_design))
    if rank < design.shape[1]:
        raise ValueError("因子矩阵不满秩；请先筛选或正交化，不能解释不可识别的系数。")
    coef = np.linalg.lstsq(fit_design, fit_y, rcond=None)[0]
    residual = yy - design @ coef
    if weights is None:
        rss = float(residual @ residual)
        tss = float(np.sum((yy - yy.mean()) ** 2))
    else:
        ww = weights[mask]
        rss = float(np.sum(ww * residual ** 2))
        weighted_mean = float(np.average(yy, weights=ww))
        tss = float(np.sum(ww * (yy - weighted_mean) ** 2))
    return {"coef": coef, "residual": residual, "mask": mask,
            "n": len(yy), "rank": rank, "conditionNumber": float(np.linalg.cond(fit_design)),
            "rSquared": 1 - rss / tss if tss > 0 else None}


def newey_west_mean(values: np.ndarray, lags: int) -> dict[str, Any]:
    """Bartlett HAC variance of a time mean (with n/(n-1) small-sample correction)."""
    data = np.asarray(values, dtype=float)
    data = data[np.isfinite(data)]
    n = len(data)
    if n < 3:
        return {"mean": float(data.mean()) if n else None, "standardError": None,
                "tStatistic": None, "observations": n, "lags": 0}
    lag = max(0, min(int(lags), n - 2))
    residual = data - data.mean()
    long_run_variance = float(residual @ residual) / n
    for offset in range(1, lag + 1):
        gamma = float(residual[offset:] @ residual[:-offset]) / n
        long_run_variance += 2 * (1 - offset / (lag + 1)) * gamma
    variance = max(0.0, long_run_variance / n * n / (n - 1))
    standard_error = math.sqrt(variance)
    mean = float(data.mean())
    return {"mean": mean, "standardError": standard_error,
            "tStatistic": mean / standard_error if standard_error > 1e-14 else None,
            "observations": n, "lags": lag}


def vif_values(x: np.ndarray) -> list[float]:
    matrix = np.asarray(x, dtype=float)
    values = []
    for index in range(matrix.shape[1]):
        y = matrix[:, index]
        if np.std(y) < 1e-12:
            values.append(float("inf"))
        elif matrix.shape[1] == 1:
            values.append(1.0)
        else:
            remaining = np.delete(matrix, index, axis=1)
            design = np.column_stack([np.ones(len(y)), remaining])
            coef = np.linalg.lstsq(design, y, rcond=None)[0]
            rss = float(np.sum((y - design @ coef) ** 2))
            tss = float(np.sum((y - y.mean()) ** 2))
            values.append(tss / rss if rss > 1e-15 else float("inf"))
    return values


def collinearity_transform(training: np.ndarray, names: list[str], method: str = "subset",
                           correlation_threshold: float = .9, vif_threshold: float = 10.) -> dict[str, Any]:
    """A fixed training-only transform; does not use targets or future exposures."""
    matrix = np.asarray(training, dtype=float)
    complete = matrix[np.isfinite(matrix).all(axis=1)]
    if len(complete) < max(10, len(names) + 2):
        raise ValueError("共线性诊断的完整训练截面不足。")
    transform = np.eye(len(names))
    kept, dropped = [], []
    for index, name in enumerate(names):
        if np.std(complete[:, index]) <= 1e-12:
            dropped.append({"factorId": name, "reason": "训练期横截面暴露恒定，系数不可识别。"})
        else:
            kept.append(index)
    if not kept:
        raise ValueError("所有因子均为常数或缺少有效暴露。")
    original_vifs = vif_values(complete)
    center = complete.mean(axis=0) if method == "orthogonalize" else np.zeros(len(names))
    complete = complete - center
    if method == "orthogonalize":
        transformed = []
        retained = []
        for index in kept:
            vector = complete[:, index].copy()
            basis_coef = np.eye(len(names))[:, index].copy()
            if transformed:
                basis = np.column_stack(transformed)
                projection = np.linalg.lstsq(basis, vector, rcond=None)[0]
                vector -= basis @ projection
                basis_coef -= transform[:, retained] @ projection
            scale = float(np.std(vector, ddof=0))
            if scale < 1e-8:
                dropped.append({"factorId": names[index], "reason": "相对前序因子无独立变化，正交残差接近零。"})
                continue
            transform[:, index] = basis_coef / scale
            transformed.append(vector / scale)
            retained.append(index)
        kept = retained
    elif method == "subset":
        retained = []
        for index in kept:
            if retained:
                correlations = [abs(float(np.corrcoef(complete[:, index], complete[:, prior])[0, 1])) for prior in retained]
                if max(correlations) >= correlation_threshold:
                    prior = retained[int(np.argmax(correlations))]
                    dropped.append({"factorId": names[index], "reason": f"与优先保留的 {names[prior]} 相关系数绝对值达 {max(correlations):.3f}。"})
                    continue
            retained.append(index)
        kept = retained
        while len(kept) > 1:
            vifs = vif_values(complete[:, kept])
            worst = int(np.argmax(vifs))
            if vifs[worst] <= vif_threshold:
                break
            # A tie removes the later input, respecting explicit user priority.
            tied = [j for j, value in enumerate(vifs) if value >= max(vifs) - 1e-8]
            worst = tied[-1]
            index = kept.pop(worst)
            dropped.append({"factorId": names[index], "reason": f"训练期VIF为 {vifs[worst]:.2f}，超过阈值 {vif_threshold:g}。"})
    else:
        raise ValueError("共线性处理只支持 subset 或 orthogonalize。")
    if not kept:
        raise ValueError("共线性处理后无可识别因子。")
    selected_transform = transform[:, kept]
    return {"matrix": selected_transform, "offset": -center @ selected_transform, "trainingMean": center, "kept": kept, "names": [names[index] for index in kept],
            "dropped": dropped, "method": method,
            "beforeVif": dict(zip(names, original_vifs)),
            "beforeVifStatus": {name:("finite" if math.isfinite(value) else "unidentified_constant_or_exact_collinearity") for name,value in zip(names,original_vifs)},
            "priorityOrder": names, "trainingRows": len(complete),
            "afterVif": dict(zip([names[index] for index in kept], vif_values(complete @ selected_transform))),
            "conditionNumber": float(np.linalg.cond(np.column_stack([np.ones(len(complete)), complete @ selected_transform])))}

FACTOR_CATALOG = {
    "momentum": {"name": "价格动量", "field": "close", "formula": "close(t) / close(t−L) − 1", "meaning": "过去L个交易日价格收益"},
    "reversal": {"name": "短期反转", "field": "close", "formula": "close(t) / close(t−L) − 1", "meaning": "过去L个交易日价格收益，方向−1表示反转"},
    "volatility": {"name": "历史波动", "field": "close", "formula": "std(log(close(t)/close(t−1)), L日, ddof=1) × √252", "meaning": "年化历史对数收益波动，方向−1偏好低波"},
    "volume_stability": {"name": "量能稳定", "field": "volume", "formula": "std(volume,L,ddof=1)/mean(volume,L)", "meaning": "成交量变异系数，方向−1偏好稳定量能"},
    "liquidity": {"name": "成交额流动性", "field": "amount", "formula": "log(mean(amount,L))", "meaning": "真实成交金额均值的对数，不用成交量替代"},
}


def validated_config(config: dict[str, Any]) -> dict[str, Any]:
    defaults = {"schemaVersion": VERSION, "method": "characteristic_fmb", "frequency": "daily", "horizon": 5,
                "universe": "csi500", "maxAssets": 60, "minCrossSection": 15, "minTrainPeriods": 120,
                "holdoutPeriods": 40, "trainStart": None, "trainEnd": None, "asOf": None, "nwLags": 4,
                "winsorizeQuantile": .01,
                "collinearity": {"method": "subset", "correlationThreshold": .9, "vifThreshold": 10},
                "portfolio": {"riskAversion": 10, "maxWeight": .2, "topN": 10, "feeRate": .0003, "slippage": .0002},
                "factors": [{"id": name, "enabled": True, "lookback": lookback, "direction": direction}
                            for name, lookback, direction in [("momentum", 20, 1), ("reversal", 5, -1),
                                                            ("volatility", 20, -1), ("volume_stability", 20, -1)]]}
    result = {**defaults, **config}
    result["collinearity"] = {**defaults["collinearity"], **(config.get("collinearity") or {})}
    result["portfolio"] = {**defaults["portfolio"], **(config.get("portfolio") or {})}
    if result["method"] not in {"characteristic_fmb", "risk_premium_fmb", "parametric_operator", "local_surrogate"}:
        raise ValueError("未知收益映射方法。")
    if result["frequency"] not in {"daily", "monthly"}:
        raise ValueError("频率只支持daily或monthly。")
    for key, lower, upper in [("horizon",1,60),("maxAssets",15,200),("minCrossSection",8,150),
                              ("minTrainPeriods",12,1000),("holdoutPeriods",5,250),("nwLags",0,120)]:
        value = result[key]
        if isinstance(value, bool) or not isinstance(value, (int,float)) or int(value) != value or not lower <= value <= upper:
            raise ValueError(f"{key}需要为{lower}到{upper}的整数。")
        result[key] = int(value)
    quantile = float(result["winsorizeQuantile"])
    if not 0 <= quantile < .2:
        raise ValueError("截面缩尾比例需要位于[0,0.2)。")
    if result["minCrossSection"] > result["maxAssets"]:
        raise ValueError("最小截面股票数不能超过最大股票数。")
    if not .5 <= float(result["collinearity"]["correlationThreshold"]) <= 1:
        raise ValueError("相关系数阈值需要在0.5到1之间。")
    if float(result["collinearity"]["vifThreshold"]) <= 1:
        raise ValueError("VIF阈值必须大于1。")
    enabled=[]
    for factor in result["factors"]:
        if not factor.get("enabled",True):
            continue
        if factor.get("id") not in FACTOR_CATALOG:
            raise ValueError(f"未实现的可计算因子：{factor.get('id')}，不能以其他公式冒充。")
        factor={**factor, "lookback":int(factor.get("lookback",20)), "direction":float(factor.get("direction",1))}
        if not 2 <= factor["lookback"] <= 252 or factor["direction"] not in {-1,1}:
            raise ValueError("因子窗口须为2到252交易日，方向只能为±1。")
        if factor["id"] in [item["id"] for item in enabled]:
            raise ValueError("同一因子不能重复配置。")
        enabled.append(factor)
    if not enabled or len(enabled) > 8:
        raise ValueError("请选择1到8个真实可计算因子。")
    result["factors"] = enabled
    portfolio=result["portfolio"]
    if isinstance(portfolio["topN"],bool) or int(portfolio["topN"])!=portfolio["topN"] or not 1<=int(portfolio["topN"])<=result["maxAssets"]:
        raise ValueError("组合topN须为1到maxAssets的整数。")
    for field in ["maxWeight","riskAversion","feeRate","slippage"]:
        parsed=finite_float(portfolio[field])
        if parsed is None:
            raise ValueError(f"组合参数{field}必须为有限数值。")
        portfolio[field]=parsed
    if not 0<portfolio["maxWeight"]<=1 or result["maxAssets"]*portfolio["maxWeight"]<1-1e-9:
        raise ValueError("个股权重上限必须可由研究股票数构成满仓组合。")
    if portfolio["riskAversion"]<=0 or not 0<=portfolio["feeRate"]<=.1 or not 0<=portfolio["slippage"]<=.1:
        raise ValueError("风险厌恶须为正，手续费和滑点须为[0,10%]的小数。")
    return result


def load_market_data(project_root: Path, config: dict[str, Any]) -> tuple[dict[str, pd.DataFrame], dict[str, Any]]:
    universe = config["universe"]
    if universe not in {"csi500", "csi300"}:
        raise ValueError("当前只支持明确登记的csi500/csi300静态成分研究子样本。")
    pool_file = project_root / f"outputs/sources/akshare/index_enhancement/processed/{universe}_pool.csv"
    raw_dir = project_root / "outputs/sources/akshare/raw/a_share_daily"
    pool = pd.read_csv(pool_file, encoding="utf-8-sig", dtype={"code":str})
    pool["code"] = pool["code"].str.zfill(6)
    ordered_codes = sorted(set(pool["code"]))
    indices = np.unique(np.linspace(0, len(ordered_codes)-1, min(config["maxAssets"],len(ordered_codes)),dtype=int))
    chosen = [ordered_codes[index] for index in indices]
    frames=[]
    fingerprint=hashlib.sha256()
    missing=[]
    names={}
    source_types=set()
    for code in chosen:
        source=raw_dir/f"{code}.csv"
        if not source.exists():
            missing.append(code)
            continue
        raw=source.read_bytes()
        if raw.startswith(b"version https://git-lfs.github.com"):
            missing.append(code)
            continue
        fingerprint.update(code.encode()+hashlib.sha256(raw).digest())
        frame=pd.read_csv(source,encoding="utf-8-sig",dtype={"code":str,"security":str})
        frame["date"]=pd.to_datetime(frame["date"],errors="coerce")
        frame=frame.dropna(subset=["date"]).drop_duplicates("date",keep="last").sort_values("date")
        frame["code"]=code
        names[code]=str(frame["name"].dropna().iloc[-1]) if "name" in frame and frame["name"].notna().any() else code
        if "source" in frame:
            source_types.update(str(item) for item in frame["source"].dropna().unique())
        for field in ["open","close","volume","amount"]:
            frame[field]=pd.to_numeric(frame[field],errors="coerce") if field in frame else np.nan
            frame.loc[frame[field] <= 0,field]=np.nan
        frames.append(frame[["date","code","open","close","volume","amount"]])
    if len(frames) < config["minCrossSection"]:
        raise ValueError("真实日线文件不足最小截面要求。")
    long=pd.concat(frames,ignore_index=True)
    calendar=pd.DatetimeIndex(sorted(long["date"].unique()))
    if config.get("asOf"):
        calendar=calendar[calendar<=pd.Timestamp(config["asOf"])]
    if len(calendar)==0:
        raise ValueError("所选asOf早于全部真实行情日期。")
    fields={field:long.pivot(index="date",columns="code",values=field).reindex(calendar).sort_index(axis=1)
            for field in ["open","close","volume","amount"]}
    data={"universe":universe,"universeFile":str(pool_file.relative_to(project_root)),
          "subsetPolicy":f"静态{universe}成分按代码序等间隔取{len(chosen)}只研究子样本；非历史PIT成分、非全市场检验。",
          "codes":chosen,"sampling":"static_pool_code_order_evenly_spaced","requestedAssets":len(chosen),"loadedAssets":len(frames),"missingCodes":missing,"assetNames":names,
          "rawStart":calendar.min(),"rawEnd":calendar.max(),"rawTradingDates":len(calendar),
          "sourceFiles":len(frames),"dataFingerprint":fingerprint.hexdigest(),
          "sources":sorted(source_types),"adjustment":"原始缓存标记qfq；回溯前复权不是严格时点数据。"}
    return fields,data


def build_panel(fields: dict[str,pd.DataFrame], config: dict[str,Any]) -> tuple[list[dict[str,Any]],pd.DatetimeIndex]:
    close,opened=fields["close"],fields["open"]
    factors=[]
    for factor in config["factors"]:
        name,lookback,direction=factor["id"],factor["lookback"],factor["direction"]
        if name in {"momentum","reversal"}:
            values=close/close.shift(lookback)-1
            # Rolling count prohibits skipping missing intermediate trading sessions.
            values=values.where(close.rolling(lookback+1).count()>=lookback+1)
        elif name=="volatility":
            values=np.log(close/close.shift(1)).rolling(lookback,min_periods=lookback).std(ddof=1)*math.sqrt(252)
        elif name=="volume_stability":
            volume=fields["volume"]
            values=volume.rolling(lookback,min_periods=lookback).std(ddof=1)/volume.rolling(lookback,min_periods=lookback).mean()
        else:
            values=np.log(fields["amount"].rolling(lookback,min_periods=lookback).mean())
        factors.append(values*direction)
    if config["frequency"]=="monthly":
        grouped=close.groupby(close.index.to_period("M"))
        dates=pd.DatetimeIndex([group.index[-1] for _,group in grouped])
        if len(dates) and dates[-1] < dates[-1] + pd.offsets.BMonthEnd(0):
            dates=dates[:-1]  # Do not label the unfinished last month as a completed month-end.
        # The first observation after signal month is the next month's first open.
        next_opens=[]
        for date in dates:
            position=close.index.get_loc(date)
            next_opens.append(opened.iloc[position+1] if position+1<len(close.index) else pd.Series(np.nan,index=close.columns))
        next_open=pd.DataFrame(next_opens,index=dates,columns=close.columns)
        sampled_close=close.reindex(dates)
        target=sampled_close.shift(-config["horizon"])/next_open-1
        factor_values=[value.reindex(dates) for value in factors]
    else:
        dates=close.index
        target=close.shift(-config["horizon"])/opened.shift(-1)-1
        # Missing intermediate observations are not silently bridged as executable.
        complete_window=close.notna().astype(int).iloc[::-1].rolling(config["horizon"],min_periods=config["horizon"]).sum().iloc[::-1].shift(-1)
        target=target.where(complete_window>=config["horizon"])
        factor_values=factors
    records=[]
    for position,date in enumerate(dates):
        raw=np.column_stack([value.loc[date].to_numpy(dtype=float) for value in factor_values])
        valid=np.isfinite(raw).all(axis=1)
        if valid.sum()<config["minCrossSection"]:
            continue
        codes=np.asarray(close.columns)[valid]
        raw=raw[valid]
        q=config["winsorizeQuantile"]
        clipped=np.clip(raw,np.quantile(raw,q,axis=0),np.quantile(raw,1-q,axis=0)) if q else raw.copy()
        mean=clipped.mean(axis=0)
        std=clipped.std(axis=0,ddof=0)
        scaled=(clipped-mean)/np.where(std>1e-12,std,1)
        scaled[:,std<=1e-12]=0
        label_end=dates[position+config["horizon"]] if position+config["horizon"]<len(dates) else None
        y=target.loc[date].to_numpy(dtype=float)[valid]
        records.append({"date":date,"labelEndDate":label_end,"codes":codes,"x":scaled,"raw":raw,
                        "normalizationMean":mean,"normalizationStd":std,"y":y})
    return records,dates


def split_panel(records: list[dict[str,Any]], dates: pd.DatetimeIndex, config: dict[str,Any]) -> tuple[list[dict[str,Any]],list[dict[str,Any]],dict[str,Any]]:
    asof=dates[-1]
    if len(dates)<=config["holdoutPeriods"]+config["horizon"]:
        raise ValueError("真实日期不足以建立指定留出验证区间。")
    holdout_start=dates[-config["holdoutPeriods"]]
    cutoff=min(holdout_start,pd.Timestamp(config["trainEnd"])+pd.Timedelta(days=1)) if config.get("trainEnd") else holdout_start
    start=pd.Timestamp(config["trainStart"]) if config.get("trainStart") else None
    training=[row for row in records if row["labelEndDate"] is not None and row["labelEndDate"]<cutoff
              and (start is None or row["date"]>=start) and np.isfinite(row["y"]).sum()>=config["minCrossSection"]]
    testing=[row for row in records if row["date"]>=holdout_start and row["labelEndDate"] is not None
             and row["labelEndDate"]<=asof and np.isfinite(row["y"]).sum()>=config["minCrossSection"]]
    if len(training)<config["minTrainPeriods"]:
        raise ValueError(f"可用训练期仅{len(training)}期，少于minTrainPeriods={config['minTrainPeriods']}；不降低统计门槛生成结果。")
    if not testing:
        raise ValueError("留出区间没有已成熟的真实收益标签，无法进行后验归因。")
    return training,testing,{"asOf":asof,"holdoutStart":holdout_start,"trainStart":training[0]["date"],
                            "trainEnd":training[-1]["date"],"trainLabelEnd":max(row["labelEndDate"] for row in training),
                            "trainPeriods":len(training),"holdoutPeriods":len(testing),"freezePolicy":"训练期一次估计并冻结全部参数；留出期不重新估计，不使用验证收益调参。"}


def _apply_transform(x:np.ndarray, transform:dict[str,Any])->np.ndarray:
    return x @ transform["matrix"] + transform.get("offset",np.zeros(transform["matrix"].shape[1]))


def _softmax_weights(mu:np.ndarray,top_n:int,max_weight:float)->np.ndarray:
    """Auditable equal-weight top-N benchmark; optimization belongs to the API layer."""
    if max_weight<=0 or len(mu)*max_weight<1-1e-9:
        raise ValueError("有效预测股票数和个股权重上限无法构成满仓组合。")
    count=min(len(mu),max(top_n,int(math.ceil(1/max_weight))))
    order=np.argsort(-mu,kind="stable")[:count]
    weights=np.zeros(len(mu))
    weights[order]=1/count
    return weights


def kernel_predict(train_x:np.ndarray,train_y:np.ndarray,query:np.ndarray,bandwidth:float)->np.ndarray:
    predictions=[]
    for start in range(0,len(query),100):
        block=query[start:start+100]
        distances=np.maximum(0,np.sum(block**2,axis=1)[:,None]+np.sum(train_x**2,axis=1)[None,:]-2*block@train_x.T)
        log_weight=-distances/(2*bandwidth**2)
        log_weight-=log_weight.max(axis=1,keepdims=True)
        weights=np.exp(log_weight)
        predictions.extend((weights@train_y)/weights.sum(axis=1))
    return np.asarray(predictions)


def local_explanation(train_x:np.ndarray,train_y:np.ndarray,point:np.ndarray,bandwidth:float)->dict[str,Any]:
    distances=np.sum((train_x-point)**2,axis=1)
    count=min(160,len(train_x))
    nearest=np.argsort(distances)[:count]
    reference=train_x[nearest]
    targets=kernel_predict(train_x,train_y,reference,bandwidth)
    weights=np.exp(-distances[nearest]/(2*bandwidth**2))
    try:
        fitted=ols(targets,reference-point,weights=weights)
        beta=fitted["coef"][1:]
        fidelity=fitted["rSquared"]
    except ValueError as error:
        raise ValueError("局部代理邻域无法识别全部系数；请减少因子或扩大邻域。") from error
    prediction=float(kernel_predict(train_x,train_y,point[None,:],bandwidth)[0])
    # Anchor the surrogate at the actual predictor. Contributions are predictor
    # decomposition at this point, not estimated structural risk compensation.
    intercept=prediction-float(point@beta)
    final_fit=intercept+reference@beta
    weighted_mean=float(np.average(targets,weights=weights))
    tss=float(np.sum(weights*(targets-weighted_mean)**2))
    rss=float(np.sum(weights*(targets-final_fit)**2))
    fidelity=1-rss/tss if tss>0 else None
    return {"prediction":prediction,"beta":beta,"intercept":intercept,"fidelity":fidelity,"referenceRows":count}


def kernel_marginals(train_x:np.ndarray,train_y:np.ndarray,query:np.ndarray,bandwidth:float)->tuple[np.ndarray,np.ndarray]:
    """Exact derivative of the executable nonlinear conditional-mean predictor."""
    means=[]
    gradients=[]
    for point in query:
        distance=np.sum((train_x-point)**2,axis=1)
        log_weight=-distance/(2*bandwidth**2)
        weight=np.exp(log_weight-log_weight.max())
        weight/=weight.sum()
        mean=float(weight@train_y)
        gradient=np.sum((weight*(train_y-mean))[:,None]*(train_x-point),axis=0)/(bandwidth**2)
        means.append(mean)
        gradients.append(gradient)
    return np.asarray(means),np.asarray(gradients)


def risk_covariance(fields:dict[str,pd.DataFrame],codes:list[str],training_end:pd.Timestamp,
                    config:dict[str,Any])->dict[str,Any]:
    prices=fields["close"].loc[:training_end,codes]
    returns=prices.pct_change(fill_method=None).tail(252)
    complete=returns.dropna(how="any")
    if len(complete)<max(30,len(codes)+2):
        return {"status":"blocked","codes":codes,"covariance":[],"message":f"共同有效训练日收益仅{len(complete)}日，禁止以0填补协方差。",
                "sourceDates":{"end":training_end},"observations":len(complete)}
    multiplier=config["horizon"]*(21 if config["frequency"]=="monthly" else 1)
    covariance=np.cov(complete.to_numpy(dtype=float),rowvar=False,ddof=1)*multiplier
    # Shrink the noisy sample estimate toward its own diagonal, preserving units.
    shrinkage=.1
    covariance=(1-shrinkage)*covariance+shrinkage*np.diag(np.diag(covariance))
    return {"status":"ok","codes":codes,"covariance":np.atleast_2d(covariance).tolist(),"horizon":config["horizon"],
            "frequency":config["frequency"],"observations":len(complete),"shrinkage":shrinkage,
            "sourceDates":{"start":complete.index[0],"end":complete.index[-1]},
            "units":"decimal_return_squared","method":"训练期完整共同日收益样本协方差，10%对角收缩；日频乘h、月频乘21h的持有期近似，未声称精确跨期协方差。"}


def assert_regular_coefficient_dates(fit_dates:list[pd.Timestamp],calendar:pd.DatetimeIndex)->None:
    """HAC lag units must be calendar periods, never compressed surviving rows."""
    if not fit_dates:
        raise ValueError("没有可用于HAC推断的截面系数时间序列。")
    observed=pd.DatetimeIndex(fit_dates)
    expected=calendar[(calendar>=observed[0]) & (calendar<=observed[-1])]
    if not observed.equals(pd.DatetimeIndex(expected)):
        missing=expected.difference(observed)
        sample=", ".join(str(date.date()) for date in missing[:5])
        raise ValueError(f"λ时间序列缺期，不能把剩余系数压缩为连续daily/monthly滞后计算HAC；缺期示例：{sample}。请补齐RF、字段或有效截面。")


def fit_model(request:dict[str,Any])->dict[str,Any]:
    config=validated_config(request.get("config") or {})
    if config["method"]=="risk_premium_fmb":
        if request.get("factorReturns"):
            return fit_risk_model(request,config)
        return {"status":"blocked","message":"严格风险溢价Fama–MacBeth需要真实因子收益与逐期无风险收益。当前未执行β第一步估计，不能把特征排序系数冒充风险价格。",
                "requiredInput":{"factorReturns":{"factorIds":["market","size","value"],"rows":[{"date":"YYYY-MM-DD","rf":"必填，decimal","market":"decimal","size":"decimal","value":"decimal"}],"units":"decimal","frequency":config["frequency"]},
                                 "riskWindow":"至少120个训练期估计每只股票收益对因子收益的β；输入时间范围须覆盖因子暴露估计和未来标签。"},
                "model":{"method":config["method"],"formula":"r(i,t)−rf(t)=α(i)+β(i)'f(t)+ε(i,t)；r(i,t+h)−rf(t+h)=λ0(t)+β(i,t)'λ(t)+u(i,t+h)",
                         "interpretation":"在明确风险因子和模型假设下解释β对应的风险补偿；当前数据不足，未校准。","coefficients":[]},
                "warnings":["无风险收益不能默认为0；股票特征暴露不能冒充第一步回归的风险β。"],"predictions":[],"backtest":{"observations":[],"metrics":{}},"attribution":{},"risk":{}}
    project_root=Path(request["projectRoot"]).resolve()
    fields,data=load_market_data(project_root,config)
    records,dates=build_panel(fields,config)
    if not records:
        raise ValueError("没有满足完整字段和截面股票数的真实因子暴露；缺失不会被补0。")
    training,testing,split=split_panel(records,dates,config)
    names=[factor["id"] for factor in config["factors"]]
    x_training=np.concatenate([row["x"][np.isfinite(row["y"])] for row in training])
    transform=collinearity_transform(x_training,names,**{
        "method":config["collinearity"]["method"],"correlation_threshold":float(config["collinearity"]["correlationThreshold"]),
        "vif_threshold":float(config["collinearity"]["vifThreshold"])})
    coefficient_rows=[]
    fit_diagnostics=[]
    skipped=[]
    for row in training:
        try:
            fitted=ols(row["y"],_apply_transform(row["x"],transform))
        except ValueError as error:
            skipped.append({"date":row["date"],"reason":str(error)})
            continue
        coefficient_rows.append(fitted["coef"])
        fit_diagnostics.append({"date":row["date"],"observations":fitted["n"],"rSquared":fitted["rSquared"],"conditionNumber":fitted["conditionNumber"]})
    if len(coefficient_rows)<config["minTrainPeriods"]:
        raise ValueError(f"剔除不可识别截面后只剩{len(coefficient_rows)}个训练期，未达到指定最低样本。")
    assert_regular_coefficient_dates([row["date"] for row in fit_diagnostics],dates)
    coefficient_series=np.asarray(coefficient_rows)
    average=coefficient_series.mean(axis=0)
    original_series=coefficient_series[:,1:]@transform["matrix"].T
    original_intercepts=coefficient_series[:,0]+coefficient_series[:,1:]@transform["offset"]
    original_beta=original_series.mean(axis=0)
    original_intercept=float(original_intercepts.mean())
    requested_lags=int(config["nwLags"])
    effective_lags=max(requested_lags,config["horizon"]-1)
    warnings=["使用当前静态指数成分的确定性子样本，存在成分存续与样本选择偏差；不代表历史时点全市场。",
              "行情缓存为qfq回溯复权，部分日期混合AkShare和腾讯补采；不是严格PIT经济研究数据库。",
              "训练估计一次冻结后再验证；当前μ和历史归因复用相同参数，不用验证期结果反向调参。",
              "统计显著性不等于因果解释；多因子与多参数试验未做多重检验校正。"]
    if config["method"]=="parametric_operator":
        warnings.append("参数化算子明确了构造逻辑，系数仍由真实收益校准；可解释构造不自动建立因果关系。")
    if requested_lags<config["horizon"]-1:
        warnings.append(f"因{config['horizon']}期收益标签重叠，HAC滞后从{requested_lags}自动提高到{effective_lags}。")
    if effective_lags>=len(coefficient_series)-1:
        raise ValueError("指定Newey–West滞后相对于训练期数过大；请扩大历史样本，不会静默截断后仍声称使用原阶数。")
    if len(coefficient_series)<5*(effective_lags+1):
        warnings.append("相对于HAC滞后，独立时间样本偏少；t统计量仅作不稳定的研究参考。")
    if transform["dropped"]:
        warnings.append("共线性筛选已剔除因子；被剔除因子的系数不可解释为0收益效应。")
    latest=next((row for row in reversed(records) if row["date"]==dates[-1]),None)
    if latest is None:
        raise ValueError(f"最新真实日期{dates[-1].date()}缺少完整因子截面；不会把旧日期股票暴露挪到最新日期。")
    kernel_x=kernel_y=None
    bandwidth=float((config.get("local") or {}).get("bandwidth",.8))
    if not .1<=bandwidth<=5:
        raise ValueError("局部核带宽须在0.1到5个标准差之间。")
    local_fit=None
    if config["method"]=="local_surrogate":
        samples_x=[]
        samples_y=[]
        for row in training:
            mask=np.isfinite(row["y"])
            samples_x.append(_apply_transform(row["x"][mask],transform))
            samples_y.append(row["y"][mask])
        kernel_x=np.concatenate(samples_x)[-1800:]
        kernel_y=np.concatenate(samples_y)[-1800:]
        anchor=_apply_transform(latest["x"][:1],transform)[0]
        local_fit=local_explanation(kernel_x,kernel_y,anchor,bandwidth)
        warnings.extend(["局部模型的系数只描述训练得到的非线性核预测器在参考点附近的变化，不是经济风险溢价，也不是因果效应。",
                         "局部拟合度检验解释器对预测器的近似能力，不是未来收益预测准确率；核预测器只使用训练数据。"])

    def predict(row:dict[str,Any])->tuple[np.ndarray,np.ndarray,np.ndarray]:
        if config["method"]=="local_surrogate":
            transformed=_apply_transform(row["x"],transform)
            expected,gradients=kernel_marginals(kernel_x,kernel_y,transformed,bandwidth)
            # Local Taylor surrogate at each asset, exact at its anchor.
            original_gradients=gradients@transform["matrix"].T
            contributions=row["x"]*original_gradients
            intercepts=expected-contributions.sum(axis=1)
            return expected,contributions,intercepts
        expected=original_intercept+row["x"]@original_beta
        contributions=row["x"]*original_beta
        return expected,contributions,np.repeat(original_intercept,len(expected))

    coefficients=[]
    for index,factor in enumerate(config["factors"]):
        if not np.any(np.abs(transform["matrix"][index])>1e-12):
            continue
        if config["method"]=="local_surrogate":
            estimate=float((transform["matrix"]@local_fit["beta"])[index])
            se=t_stat=None
            meaning=f"参考股票{latest['codes'][0]}附近，{FACTOR_CATALOG[factor['id']]['name']}有向暴露增加1个当期截面标准差，局部WLS近似的预测变化；仅局部关联。"
        else:
            result=newey_west_mean(original_series[:,index],effective_lags)
            estimate,se,t_stat=result["mean"],result["standardError"],result["tStatistic"]
            meaning=f"控制其余保留因子后，{FACTOR_CATALOG[factor['id']]['name']}有向暴露增加1个当期截面标准差，对{config['horizon']}期条件预期收益的平均关联。"
        coefficients.append({"factorId":factor["id"],"name":FACTOR_CATALOG[factor['id']]["name"],"estimate":estimate,
                             "standardError":se,"tStatistic":t_stat,"unit":f"decimal_return_per_1_cross_section_std_over_{config['horizon']}_{config['frequency']}_periods",
                             "meaning":meaning,"direction":factor["direction"],"lookback":factor["lookback"],
                             "rawFormula":FACTOR_CATALOG[factor["id"]]["formula"],"signInterpretation":"系数符号来自训练数据估计，未强制为正。"})
    latest_expected,latest_contributions,latest_intercepts=predict(latest)
    predictions=[]
    for index,code in enumerate(latest["codes"]):
        predictions.append({"date":latest["date"],"code":str(code),"name":data["assetNames"].get(str(code),str(code)),
                            "expectedReturn":float(latest_expected[index]),"intercept":float(latest_intercepts[index]),
                            "exposures":dict(zip(names,latest["x"][index])),"rawExposures":dict(zip(names,latest["raw"][index])),
                            "contributions":dict(zip(names,latest_contributions[index]))})
    predictions.sort(key=lambda row:row["expectedReturn"],reverse=True)
    observations=[]
    next_entry=None
    for row in testing:
        if next_entry is not None and row["date"]<next_entry:
            continue
        expected,contributions,intercepts=predict(row)
        finite=np.isfinite(row["y"])
        # Portfolio is selected before inspecting future labels. Missing prices in
        # any selected asset block the period rather than selecting surviving winners.
        weights=_softmax_weights(expected,int(config["portfolio"]["topN"]),float(config["portfolio"]["maxWeight"]))
        selected=weights>0
        if not finite[selected].all():
            skipped.append({"date":row["date"],"reason":"预先选中的持仓缺真实到期收益；该期阻塞，不用事后可见收益筛掉股票。"})
            next_entry=row["labelEndDate"]
            continue
        gross=float(weights[selected]@row["y"][selected])
        expected_portfolio=float(weights@expected)
        factor_contributions=dict(zip(names,weights@contributions))
        intercept=float(weights@intercepts)
        residual=gross-intercept-sum(factor_contributions.values())
        cost=2*(float(config["portfolio"]["feeRate"])+float(config["portfolio"]["slippage"]))
        observations.append({"date":row["date"],"labelEndDate":row["labelEndDate"],"expectedReturn":expected_portfolio,
                             "realizedReturn":gross,"grossReturn":gross,"netReturn":gross-cost,"cost":cost,
                             "factorContributions":factor_contributions,"intercept":intercept,"residual":residual,
                             "weights":[{"code":str(code),"weight":float(weight)} for code,weight in zip(row["codes"],weights) if weight>0],
                             "modelEstimationCutoff":split["trainLabelEnd"],"frozenParameters":True})
        next_entry=row["labelEndDate"]
    if not observations:
        warnings.append("验证期预选持仓均缺少完整执行标签；不输出伪造的组合绩效。")
    net_returns=np.asarray([row["netReturn"] for row in observations])
    gross_returns=np.asarray([row["grossReturn"] for row in observations])
    wealth=np.cumprod(1+net_returns) if len(net_returns) else np.array([])
    drawdowns=wealth/np.maximum.accumulate(np.r_[1,wealth])[1:]-1 if len(wealth) else np.array([])
    metrics={"observations":len(observations),"cumulativeNetReturn":float(wealth[-1]-1) if len(wealth) else None,
             "averageExpectedReturn":float(np.mean([row["expectedReturn"] for row in observations])) if observations else None,
             "averageRealizedReturn":float(gross_returns.mean()) if len(gross_returns) else None,
             "maxDrawdown":float(min(0,drawdowns.min())) if len(drawdowns) else None,
             "predictionRMSE":float(np.sqrt(np.mean([(row["realizedReturn"]-row["expectedReturn"])**2 for row in observations]))) if observations else None,
             "winRate":float(np.mean(net_returns>0)) if len(net_returns) else None}
    averages={key:float(np.mean([row[key] for row in observations])) if observations else None for key in ["intercept","residual","cost","grossReturn","netReturn","expectedReturn"]}
    mean_factors={name:float(np.mean([row["factorContributions"][name] for row in observations])) if observations else None for name in names}
    errors=[abs(row["grossReturn"]-row["intercept"]-sum(row["factorContributions"].values())-row["residual"]) for row in observations]
    model={"method":config["method"],"formula":"μ(i,t)=λ̄₀ + Σ λ̄ⱼ·zⱼ(i,t)" if config["method"]!="local_surrogate" else "μ(i,t)=Σ K_b(z(i,t),z_train)·r_train / Σ K_b；局部 μ≈a(x₀)+b(x₀)'z",
           "interpretation":"有向特征的条件收益关联；并非时间序列β的经济风险价格或因果效应。" if config["method"]!="local_surrogate" else "可执行非线性核回归的局部线性解释；局部边际效应随股票暴露点变化。",
           "coefficients":coefficients,"intercept":newey_west_mean(original_intercepts,effective_lags) if config["method"]!="local_surrogate" else {"estimate":float(local_fit["intercept"]+transform["offset"]@local_fit["beta"]),"meaning":"参考点局部代理截距，已回转原始z暴露单位，不是无风险收益。"},
           "normalization":{"method":"同日完整研究子样本截面分位缩尾后zscore(ddof=0)，先乘配置方向；所有字段缺失保持缺失。","winsorizeQuantile":config["winsorizeQuantile"],"lookbackUnit":"trading_days","latestMean":dict(zip(names,latest["normalizationMean"])),"latestStd":dict(zip(names,latest["normalizationStd"]))},
           "collinearity":{key:value for key,value in transform.items() if key!="kept"},
           "neweyWest":{"kernel":"Bartlett","requestedLags":requested_lags,"effectiveLags":effective_lags,"frequency":config["frequency"],"timeObservations":len(coefficient_series),"variance":"HAC variance of time-mean cross-sectional coefficients, n/(n−1) correction"},
           "estimationCutoff":split["trainLabelEnd"],"parameterPolicy":split["freezePolicy"],"target":("close(t+h)/open(t+1)−1；t收盘形成信号，下一个交易日开盘进入，第h个交易日收盘退出。" if config["frequency"]=="daily" else "月末信号，下月第一个真实交易日开盘进入，第h个月末收盘退出；不把未完成月当月末。") }
    if local_fit is not None:
        model["localExplanation"]={"anchorCode":str(latest["codes"][0]),"anchorExposures":dict(zip(names,latest["x"][0])),"bandwidth":bandwidth,
                                   "referenceRows":local_fit["referenceRows"],"trainingRows":len(kernel_y),"weightedRSquared":local_fit["fidelity"],
                                   "coefficientMeaning":"上表是参考点邻域加权最小二乘代理；每只股票归因用同一核预测器的本地点一阶边际，截距锚定以精确还原其预测。",
                                   "standardErrors":"局部代理系数不套用FMB/HAC t值，不将解释拟合度当作预测显著性。"}
    coverage={factor["id"]:sum(np.isfinite(row["raw"][:,index]).sum() for row in records) for index,factor in enumerate(config["factors"])}
    result={"status":"ok","schemaVersion":VERSION,"config":config,"model":model,"data":{**data,**split,"latestPredictionDate":latest["date"],"predictionAssets":len(predictions),"factorObservations":coverage},
            "diagnostics":{"crossSections":fit_diagnostics,"skippedPeriods":skipped,"fitPeriods":len(coefficient_series),"coefficientTimeSeries":coefficient_series.tolist(),
                           "attributionMaxAbsoluteError":max(errors) if errors else None,"noLookAhead":bool(split["trainLabelEnd"]<split["holdoutStart"]),"missingPolicy":"不前填、不补0；未来持仓标签缺失则整期阻塞。"},
            "warnings":warnings,"predictions":predictions,
            "backtest":{"observations":observations,"metrics":metrics,"policy":"冻结映射的TopN等权检验；期末全平仓、持有期不重叠、每期扣双边手续费及滑点；不是组合优化结果。","outOfSample":True},
            "attribution":{"identity":"grossReturn = intercept + ΣfactorContributions + residual；netReturn = grossReturn − cost。","basis":"各持有期算术收益与预测贡献；不将算术贡献直接相加冒充累计复利收益。","average":averages,"factorContributions":mean_factors,
                           "maxAbsoluteReconciliationError":max(errors) if errors else None,"sameFrozenModel":True},
            "risk":risk_covariance(fields,[row["code"] for row in predictions],split["trainLabelEnd"],config)}
    return json_clean(result)


def fit_risk_model(request:dict[str,Any],config:dict[str,Any])->dict[str,Any]:
    """Three disjoint date blocks: beta estimation, lambda estimation, validation."""
    if config['frequency']!='daily':
        raise ValueError('严格风险β路径当前只支持daily真实序列。月频需独立按月聚合和校验，当前不会静默转为日频。')
    imported=request.get('factorReturns') or {}
    if imported.get('units')!='decimal' or imported.get('frequency')!=config['frequency']:
        raise ValueError('风险因子收益必须声明units=decimal，且frequency与模型配置一致。')
    factor_ids=imported.get('factorIds')
    if not isinstance(factor_ids,list) or not 1<=len(factor_ids)<=6 or len(set(factor_ids))!=len(factor_ids):
        raise ValueError('真实风险因子收益需要1到6个唯一factorIds。')
    if any(not isinstance(name,str) or name in {'date','rf','__proto__'} for name in factor_ids):
        raise ValueError('风险因子标识不可与date/rf冲突。')
    rows=imported.get('rows')
    if not isinstance(rows,list) or not rows:
        raise ValueError('真实风险因子收益rows不能为空。')
    frame=pd.DataFrame(rows)
    required=['date','rf',*factor_ids]
    if any(name not in frame for name in required):
        raise ValueError('风险因子收益必须逐期提供date、rf和所有factorIds字段。')
    frame=frame[required].copy()
    frame['date']=pd.to_datetime(frame['date'],errors='coerce')
    if frame['date'].isna().any() or frame['date'].duplicated().any():
        raise ValueError('风险因子日期无效或重复；必须先显式去重并确认口径。')
    for name in ['rf',*factor_ids]:
        frame[name]=pd.to_numeric(frame[name],errors='coerce')
        if not np.isfinite(frame[name].to_numpy(dtype=float)).all():
            raise ValueError(f'真实风险序列{name}有缺失或非有限值；不会补0。')
    if (frame['rf']<=-1).any():
        raise ValueError('无风险收益不能小于等于−100%。')
    frame=frame.set_index('date').sort_index()
    project_root=Path(request['projectRoot']).resolve()
    fields,data=load_market_data(project_root,config)
    dates=fields['close'].index
    daily_returns=fields['close'].pct_change(fill_method=None)
    common=dates.intersection(frame.index)
    common=common[daily_returns.reindex(common).notna().sum(axis=1)>=config['minCrossSection']]
    risk_window=int(config.get('riskWindow',120))
    if not 60<=risk_window<=504:
        raise ValueError('riskWindow须为60到504个交易期。')
    if len(common)<risk_window+config['minTrainPeriods']+config['holdoutPeriods']+config['horizon']:
        raise ValueError('真实因子收益历史不足以分离β估计、λ估计和留出验证三个日期区间。')
    beta_dates=common[:risk_window]
    beta_end=beta_dates[-1]
    beta_x=frame.loc[beta_dates,factor_ids].to_numpy(dtype=float)
    beta_values=[]
    beta_codes=[]
    beta_diagnostics=[]
    for code in fields['close'].columns:
        excess=daily_returns.loc[beta_dates,code].to_numpy(dtype=float)-frame.loc[beta_dates,'rf'].to_numpy(dtype=float)
        if not np.isfinite(excess).all():
            continue
        try:
            fitted=ols(excess,beta_x)
        except ValueError:
            continue
        beta_values.append(fitted['coef'][1:])
        beta_codes.append(str(code))
        beta_diagnostics.append({'code':str(code),'alpha':float(fitted['coef'][0]),'rSquared':fitted['rSquared'],'observations':fitted['n']})
    if len(beta_codes)<max(config['minCrossSection'],len(factor_ids)+3):
        raise ValueError('第一步完整风险暴露β估计股票数不足；不以缺失β补0。')
    beta=np.asarray(beta_values)
    transform=collinearity_transform(beta,factor_ids,config['collinearity']['method'],float(config['collinearity']['correlationThreshold']),float(config['collinearity']['vifThreshold']))
    transformed_beta=_apply_transform(beta,transform)
    close=fields['close'][beta_codes]
    opened=fields['open'][beta_codes]
    target=close.shift(-config['horizon'])/opened.shift(-1)-1
    complete_window=close.notna().astype(int).iloc[::-1].rolling(config['horizon'],min_periods=config['horizon']).sum().iloc[::-1].shift(-1)
    target=target.where(complete_window>=config['horizon'])
    records=[]
    for position,date in enumerate(dates):
        if date<=beta_end:
            continue
        end=dates[position+config['horizon']] if position+config['horizon']<len(dates) else None
        actual_rf=None
        if end is not None:
            future_dates=dates[position+1:position+config['horizon']+1]
            if future_dates.isin(frame.index).all():
                actual_rf=float(np.prod(1+frame.loc[future_dates,'rf'].to_numpy(dtype=float))-1)
        past_rf=frame.loc[:date,'rf']
        if past_rf.empty:
            continue
        forecast_rf=float((1+float(past_rf.iloc[-1]))**config['horizon']-1)
        total=target.loc[date].to_numpy(dtype=float)
        excess=total-actual_rf if actual_rf is not None else np.repeat(np.nan,len(beta_codes))
        records.append({'date':date,'labelEndDate':end,'x':beta,'codes':np.asarray(beta_codes),'y':excess,
                        'totalReturns':total,'riskFreeRealized':actual_rf,'riskFreeForecast':forecast_rf,'riskFreeObservedDate':past_rf.index[-1]})
    training,testing,split=split_panel(records,dates,config)
    coefficient_rows=[]
    diagnostics=[]
    for row in training:
        fitted=ols(row['y'],transformed_beta)
        coefficient_rows.append(fitted['coef'])
        diagnostics.append({'date':row['date'],'observations':fitted['n'],'rSquared':fitted['rSquared'],'conditionNumber':fitted['conditionNumber']})
    assert_regular_coefficient_dates([row["date"] for row in diagnostics],dates)
    coefficient_series=np.asarray(coefficient_rows)
    original_series=coefficient_series[:,1:]@transform['matrix'].T
    original_intercepts=coefficient_series[:,0]+coefficient_series[:,1:]@transform['offset']
    premiums=original_series.mean(axis=0)
    pricing_intercept=float(original_intercepts.mean())
    lags=max(int(config['nwLags']),config['horizon']-1)
    if lags>=len(coefficient_series)-1:
        raise ValueError('Newey–West滞后相对于λ估计区间过大。')
    coefficients=[]
    for index,name in enumerate(factor_ids):
        if not np.any(np.abs(transform['matrix'][index])>1e-12):
            continue
        result=newey_west_mean(original_series[:,index],lags)
        coefficients.append({'factorId':name,'name':name,'estimate':result['mean'],'standardError':result['standardError'],'tStatistic':result['tStatistic'],
                             'unit':f'decimal_excess_return_per_1_beta_over_{config["horizon"]}_daily_periods',
                             'meaning':f'控制其他保留风险β后，第一步{name}风险暴露增加1单位对应的{config["horizon"]}交易日平均超额收益补偿；依赖风险因子与定价模型成立。'})
    latest=records[-1]
    current_available=fields['close'].loc[latest['date'],beta_codes].notna().to_numpy()
    latest_beta=beta[current_available]
    latest_codes=np.asarray(beta_codes)[current_available]
    latest_excess=pricing_intercept+latest_beta@premiums
    predictions=[]
    for index,code in enumerate(latest_codes):
        contributions=latest_beta[index]*premiums
        predictions.append({'date':latest['date'],'code':str(code),'name':data['assetNames'].get(str(code),str(code)),
                            'expectedReturn':float(latest['riskFreeForecast']+latest_excess[index]),'expectedExcessReturn':float(latest_excess[index]),
                            'riskFreeForecast':latest['riskFreeForecast'],'riskFreeObservedDate':latest['riskFreeObservedDate'],
                            'intercept':pricing_intercept+latest['riskFreeForecast'],'pricingIntercept':pricing_intercept,
                            'exposures':dict(zip(factor_ids,latest_beta[index])),'contributions':dict(zip(factor_ids,contributions))})
    predictions.sort(key=lambda row:row['expectedReturn'],reverse=True)
    observations=[]
    skipped=[]
    next_entry=None
    for row in testing:
        if next_entry is not None and row['date']<next_entry:
            continue
        expected_excess=pricing_intercept+beta@premiums
        expected=expected_excess+row['riskFreeForecast']
        weights=_softmax_weights(expected,int(config['portfolio']['topN']),float(config['portfolio']['maxWeight']))
        selected=weights>0
        if not np.isfinite(row['totalReturns'][selected]).all() or row['riskFreeRealized'] is None:
            skipped.append({'date':row['date'],'reason':'预选持仓或无风险收益缺少已成熟真实标签；该持有期阻塞。'})
            next_entry=row['labelEndDate']
            continue
        gross=float(weights[selected]@row['totalReturns'][selected])
        factor_contributions=dict(zip(factor_ids,(weights@beta)*premiums))
        intercept=pricing_intercept+row['riskFreeForecast']
        residual=gross-intercept-sum(factor_contributions.values())
        cost=2*(float(config['portfolio']['feeRate'])+float(config['portfolio']['slippage']))
        observations.append({'date':row['date'],'labelEndDate':row['labelEndDate'],'expectedReturn':float(weights@expected),
                             'expectedExcessReturn':float(weights@expected_excess),'realizedReturn':gross,'grossReturn':gross,'netReturn':gross-cost,'cost':cost,
                             'realizedExcessReturn':gross-row['riskFreeRealized'],'riskFreeRealized':row['riskFreeRealized'],'riskFreeForecast':row['riskFreeForecast'],
                             'pricingIntercept':pricing_intercept,'factorContributions':factor_contributions,'intercept':intercept,'residual':residual,
                             'weights':[{'code':str(code),'weight':float(weight)} for code,weight in zip(beta_codes,weights) if weight>0],
                             'modelEstimationCutoff':split['trainLabelEnd'],'frozenParameters':True})
        next_entry=row['labelEndDate']
    net=np.asarray([row['netReturn'] for row in observations])
    wealth=np.cumprod(1+net) if len(net) else np.array([])
    drawdowns=wealth/np.maximum.accumulate(np.r_[1,wealth])[1:]-1 if len(wealth) else np.array([])
    metrics={'observations':len(observations),'cumulativeNetReturn':float(wealth[-1]-1) if len(wealth) else None,
             'averageExpectedReturn':float(np.mean([row['expectedReturn'] for row in observations])) if observations else None,
             'averageRealizedReturn':float(np.mean([row['grossReturn'] for row in observations])) if observations else None,
             'maxDrawdown':float(min(0,drawdowns.min())) if len(drawdowns) else None,
             'predictionRMSE':float(np.sqrt(np.mean([(row['grossReturn']-row['expectedReturn'])**2 for row in observations]))) if observations else None,
             'winRate':float(np.mean(net>0)) if len(net) else None}
    errors=[abs(row['grossReturn']-row['intercept']-sum(row['factorContributions'].values())-row['residual']) for row in observations]
    warnings=['严格风险路径的风险价格解释依赖所选真实风险因子、固定β和线性定价假设；不等于因果识别。',
              '采用独立第一段估计β，第二段估计λ，第三段留出验证；β和λ都在验证前冻结。',
              'Newey–West只调整λ时间序列均值的自相关/异方差；尚未进行Shanken生成β误差校正，t值不应被当作完整定价检验。',
              '当前静态成分子样本与qfq回溯复权存在存续和时点偏差，尚非严格PIT数据库。',
              '最新总预期收益的无风险部分，明确假设最近已知RF按持有期持平复合；未来真实RF未知，历史预测不使用未来实际RF。',
              '收益标签为下期开盘到持有期末收盘；RF按相应交易日期完整日收益复合，未细分日内无风险利息。']
    if transform['dropped']:
        warnings.append('风险β共线性筛选已剔除不可单独识别因子，其价格不能解释为0。')
    latest_rf_date=latest['riskFreeObservedDate']
    if latest_rf_date<latest['date']:
        warnings.append(f'最近已知RF日期为{latest_rf_date.date()}，早于当前暴露日期；持平预测包含陈旧利率假设。')
    config={**config,'riskWindow':risk_window,'riskFreeForecast':'last_observed_compound'}
    return json_clean({'status':'ok','schemaVersion':VERSION,'config':config,
            'model':{'method':'risk_premium_fmb','formula':'r(i,t)−rf(t)=α(i)+β(i)′f(t)+ε；未来超额收益=λ₀(t)+β(i)′λ(t)+u；μ=RF持平预测+λ̄₀+β′λ̄',
                     'interpretation':'单位风险β对应的平均持有期超额补偿；第一步股票时间序列β与第二步跨股票风险价格分开估计。',
                     'coefficients':coefficients,'intercept':newey_west_mean(original_intercepts,lags),
                     'normalization':{'method':'原始时间序列风险β，不做横截面zscore；正交化后回转原始β单位。','unit':'unit_beta'},
                     'collinearity':{key:value for key,value in transform.items() if key!='kept'},
                     'neweyWest':{'kernel':'Bartlett','requestedLags':config['nwLags'],'effectiveLags':lags,'frequency':'daily','timeObservations':len(coefficient_series),'shankenAdjusted':False},
                     'estimationCutoff':split['trainLabelEnd'],'betaEstimationStart':beta_dates[0],'betaEstimationEnd':beta_end,'betaEstimationPeriods':risk_window,
                     'betas':[{'code':code,'exposures':dict(zip(factor_ids,values))} for code,values in zip(beta_codes,beta)],
                     'riskFreeForecast':{'method':'last_observed_compound','observedDate':latest_rf_date,'holdingPeriodForecast':latest['riskFreeForecast']},
                     'parameterPolicy':split['freezePolicy'],'target':'下一交易日开盘到第h交易日收盘总收益，第二步定价回归减去对应真实RF复合收益。'},
            'data':{**data,**split,'betaEstimationStart':beta_dates[0],'betaEstimationEnd':beta_end,'betaAssets':len(beta_codes),
                    'latestPredictionDate':latest['date'],'predictionAssets':len(predictions),'factorReturnStart':frame.index[0],'factorReturnEnd':frame.index[-1],
                    'factorReturnSource':imported.get('source','用户导入真实因子收益序列，真实性由导入来源负责。')},
            'diagnostics':{'firstPass':beta_diagnostics,'crossSections':diagnostics,'coefficientTimeSeries':coefficient_series.tolist(),'fitPeriods':len(coefficient_series),
                           'skippedPeriods':skipped,'noLookAhead':bool(beta_end<training[0]['date'] and split['trainLabelEnd']<split['holdoutStart']),
                           'threeDisjointStages':True,'attributionMaxAbsoluteError':max(errors) if errors else None},
            'warnings':warnings,'predictions':predictions,
            'backtest':{'observations':observations,'metrics':metrics,'policy':'冻结β与λ的TopN等权留出检验；非重叠持有期、期末全平仓、每期双边成本；不作为优化组合表现。','outOfSample':True},
            'attribution':{'identity':'总grossReturn = RF预测+定价截距+Σβλ+残差；netReturn=grossReturn−cost。实际RF−RF预测差额包含在残差。',
                           'basis':'持有期算术分解；累计收益单独复利，未把分项算术和冒充累计收益。','sameFrozenModel':True,
                           'average':{key:float(np.mean([row[key] for row in observations])) if observations else None for key in ['intercept','residual','cost','grossReturn','netReturn','expectedReturn','riskFreeForecast','riskFreeRealized','pricingIntercept']},
                           'factorContributions':{name:float(np.mean([row['factorContributions'][name] for row in observations])) if observations else None for name in factor_ids},
                           'maxAbsoluteReconciliationError':max(errors) if errors else None},
            'risk':risk_covariance(fields,[row['code'] for row in predictions],split['trainLabelEnd'],config)})


def main()->None:
    try:
        request=json.load(sys.stdin)
        result=fit_model(request)
    except (ValueError,FileNotFoundError,KeyError) as error:
        result={"status":"blocked","message":str(error),"schemaVersion":VERSION,"warnings":[],"predictions":[],"backtest":{"observations":[],"metrics":{}},"attribution":{},"risk":{}}
    except Exception as error:
        result={"status":"error","message":f"收益映射计算失败：{type(error).__name__}: {error}","schemaVersion":VERSION,"warnings":[]}
    print(json.dumps(json_clean(result),ensure_ascii=False,allow_nan=False,separators=(",",":")))


if __name__=="__main__":
    main()
