"""Numerical and information-timing invariants for return mapping.

Synthetic observations exist solely inside temporary test fixtures and are never
published as platform research results.
"""
import copy
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from factor_return_mapping import (
    _apply_transform, assert_regular_coefficient_dates, build_panel, collinearity_transform, fit_model,
    kernel_marginals, kernel_predict, local_explanation, newey_west_mean,
    ols, validated_config,
)


class NumericalMappingTests(unittest.TestCase):
    def test_ols_recovers_identifiable_economic_slopes(self):
        rng=np.random.default_rng(3)
        x=rng.normal(size=(300,3))
        expected=np.array([.003,.02,-.01,.007])
        y=np.column_stack([np.ones(300),x])@expected
        actual=ols(y,x)['coef']
        np.testing.assert_allclose(actual,expected,atol=1e-12)

    def test_rank_deficiency_does_not_generate_fake_coefficients(self):
        x=np.arange(30,dtype=float)
        with self.assertRaises(ValueError):
            ols(x,np.column_stack([x,2*x]))
        selected=collinearity_transform(np.column_stack([x,2*x]),['size','amount'])
        self.assertEqual(selected['names'],['size'])
        self.assertEqual(selected['dropped'][0]['factorId'],'amount')

    def test_training_only_affine_orthogonalization_and_back_mapping(self):
        rng=np.random.default_rng(9)
        x=rng.normal(size=(200,3))+np.array([4,-3,8])
        x[:,1]+=.7*x[:,0]
        transform=collinearity_transform(x,['a','b','c'],'orthogonalize')
        q=_apply_transform(x,transform)
        np.testing.assert_allclose(q.mean(axis=0),0,atol=1e-12)
        np.testing.assert_allclose(np.corrcoef(q.T),np.eye(3),atol=1e-12)
        beta=np.array([.01,-.02,.03])
        alpha=.002
        original_beta=transform['matrix']@beta
        original_alpha=alpha+transform['offset']@beta
        np.testing.assert_allclose(alpha+q@beta,original_alpha+x@original_beta,atol=1e-12)

    def test_newey_west_matches_independent_bartlett_calculation(self):
        series=np.array([.2,.4,.1,-.3,-.1,.5,.6,.2,.1,.3])
        lags=2
        e=series-series.mean()
        n=len(e)
        variance=np.dot(e,e)/n
        for lag in range(1,lags+1):
            variance+=2*(1-lag/(lags+1))*np.dot(e[lag:],e[:-lag])/n
        expected=np.sqrt(variance/(n-1))
        result=newey_west_mean(series,lags)
        self.assertAlmostEqual(result['standardError'],expected,14)
        correlated=np.sin(np.arange(400)/15)+.2
        self.assertGreater(newey_west_mean(correlated,12)['standardError'],newey_west_mean(correlated,0)['standardError'])

    def test_missing_calendar_price_does_not_skip_to_later_observation(self):
        dates=pd.bdate_range('2025-01-01',periods=20)
        columns=[f'{i:06d}' for i in range(15)]
        values=np.tile(np.arange(20,dtype=float)[:,None]+100,(1,15))
        close=pd.DataFrame(values,index=dates,columns=columns)
        close.loc[dates[10],columns[0]]=np.nan
        fields={'close':close,'open':close.copy(),'volume':close*100,'amount':close*1000}
        config=validated_config({'horizon':3,'minTrainPeriods':12,'factors':[{'id':'momentum','lookback':2,'direction':1}]})
        panel,_=build_panel(fields,config)
        signal=next(row for row in panel if row['date']==dates[8])
        index=list(signal['codes']).index(columns[0])
        self.assertTrue(np.isnan(signal['y'][index]))

    def test_kernel_marginal_matches_finite_difference(self):
        rng=np.random.default_rng(4)
        x=rng.normal(size=(90,2))
        y=.01*x[:,0]**2-.02*x[:,1]
        query=np.array([[.3,-.2]])
        mean,gradient=kernel_marginals(x,y,query,.8)
        epsilon=1e-5
        for j in range(2):
            positive=query.copy(); positive[0,j]+=epsilon
            negative=query.copy(); negative[0,j]-=epsilon
            difference=(kernel_predict(x,y,positive,.8)-kernel_predict(x,y,negative,.8))/(2*epsilon)
            self.assertAlmostEqual(gradient[0,j],difference[0],9)
        explanation=local_explanation(x,y,query[0],.8)
        self.assertAlmostEqual(explanation['intercept']+query[0]@explanation['beta'],mean[0],12)


class FrozenModelIntegrationTests(unittest.TestCase):
    def make_market(self,directory:Path,periods=340):
        rng=np.random.default_rng(42)
        dates=pd.bdate_range('2024-01-02',periods=periods)
        factor=rng.normal(.0007,.009,size=periods)
        rf=np.repeat(.00008,periods)
        pool=directory/'outputs/sources/akshare/index_enhancement/processed'
        raw=directory/'outputs/sources/akshare/raw/a_share_daily'
        pool.mkdir(parents=True)
        raw.mkdir(parents=True)
        codes=[f'{i+1:06d}' for i in range(15)]
        pd.DataFrame({'code':codes,'name':codes}).to_csv(pool/'csi500_pool.csv',index=False)
        known_betas=np.linspace(.4,1.8,15)
        for i,code in enumerate(codes):
            daily=rf+known_betas[i]*factor+rng.normal(0,.0015,periods)
            close=100*np.cumprod(1+daily)
            opened=np.r_[close[0],close[:-1]]  # RF/next-open target is aligned to the true next daily return.
            volume=np.exp(rng.normal(12,.2,periods))
            pd.DataFrame({'date':dates.strftime('%Y-%m-%d'),'code':code,'open':opened,'close':close,
                          'volume':volume,'amount':volume*close,'source':'synthetic_test_only','name':code}).to_csv(raw/f'{code}.csv',index=False)
        imported={'factorIds':['market'],'frequency':'daily','units':'decimal','source':'synthetic_unit_test_only',
                  'rows':[{'date':str(date.date()),'rf':float(rate),'market':float(value)} for date,rate,value in zip(dates,rf,factor)]}
        return dates,imported,known_betas

    def config(self):
        return {'maxAssets':15,'minCrossSection':10,'minTrainPeriods':60,'holdoutPeriods':30,
                'horizon':1,'nwLags':4,'riskWindow':60,'factors':[{'id':'momentum','enabled':True,'lookback':5,'direction':1},
                           {'id':'volatility','enabled':True,'lookback':10,'direction':-1}],
                'portfolio':{'topN':5,'maxWeight':.3}}

    def test_frozen_holdout_and_attribution_are_consistent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            self.make_market(root)
            result=fit_model({'projectRoot':str(root),'config':self.config()})
            self.assertEqual(result['status'],'ok')
            self.assertTrue(result['diagnostics']['noLookAhead'])
            self.assertLess(result['data']['trainLabelEnd'],result['data']['holdoutStart'])
            self.assertTrue(result['backtest']['outOfSample'])
            for row in result['backtest']['observations']:
                self.assertAlmostEqual(row['grossReturn'],row['intercept']+sum(row['factorContributions'].values())+row['residual'],13)
                self.assertAlmostEqual(row['netReturn'],row['grossReturn']-row['cost'],13)
            self.assertLess(result['risk']['sourceDates']['end'],result['data']['holdoutStart'])
            # Change only future validation prices. Training parameters must stay fixed.
            cutoff=pd.Timestamp(result['data']['holdoutStart'])
            for path in (root/'outputs/sources/akshare/raw/a_share_daily').glob('*.csv'):
                frame=pd.read_csv(path)
                mask=pd.to_datetime(frame['date'])>=cutoff
                frame.loc[mask,'close']*=np.linspace(1.01,1.2,mask.sum())
                frame.to_csv(path,index=False)
            changed=fit_model({'projectRoot':str(root),'config':self.config()})
            np.testing.assert_allclose([c['estimate'] for c in result['model']['coefficients']],
                                       [c['estimate'] for c in changed['model']['coefficients']],atol=1e-12)

    def test_risk_fmb_estimates_beta_then_lambda_then_holds_out(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            _,imported,known=self.make_market(root)
            config={**self.config(),'method':'risk_premium_fmb'}
            result=fit_model({'projectRoot':str(root),'config':config,'factorReturns':imported})
            self.assertEqual(result['status'],'ok')
            self.assertTrue(result['diagnostics']['threeDisjointStages'])
            self.assertLess(result['model']['betaEstimationEnd'],result['data']['trainStart'])
            self.assertLess(result['data']['trainLabelEnd'],result['data']['holdoutStart'])
            estimated=np.array([entry['exposures']['market'] for entry in result['model']['betas']])
            self.assertLess(np.max(np.abs(estimated-known)),.08)
            self.assertEqual(result['model']['normalization']['unit'],'unit_beta')
            self.assertFalse(result['model']['neweyWest']['shankenAdjusted'])
            self.assertEqual(result['config']['riskFreeForecast'],'last_observed_compound')
            for row in result['predictions']:
                self.assertAlmostEqual(row['expectedReturn'],row['expectedExcessReturn']+row['riskFreeForecast'],13)
            self.assertLess(result['attribution']['maxAbsoluteReconciliationError'],1e-12)

    def test_risk_missing_rf_is_explicitly_blocked(self):
        result=fit_model({'projectRoot':'.','config':{'method':'risk_premium_fmb'}})
        self.assertEqual(result['status'],'blocked')
        self.assertIn('rf',result['requiredInput']['factorReturns']['rows'][0])

    def test_missing_rf_period_cannot_be_compressed_for_hac(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            dates,imported,_=self.make_market(root)
            imported["rows"]=[row for row in imported["rows"] if row["date"]!=str(dates[150].date())]
            config={**self.config(),"method":"risk_premium_fmb"}
            with self.assertRaisesRegex(ValueError,"λ时间序列缺期"):
                fit_model({"projectRoot":str(root),"config":config,"factorReturns":imported})

    def test_hac_periods_cannot_skip_a_research_calendar_date(self):
        calendar=pd.bdate_range("2025-01-01",periods=5)
        with self.assertRaisesRegex(ValueError,"λ时间序列缺期"):
            assert_regular_coefficient_dates([calendar[0],calendar[2],calendar[3]],calendar)

    def test_unfinished_month_is_not_month_end(self):
        dates=pd.bdate_range('2024-01-01','2025-05-15')
        columns=[f'{i:06d}' for i in range(15)]
        close=pd.DataFrame(np.tile(np.arange(len(dates))[:,None]+100,(1,15)),index=dates,columns=columns)
        fields={'close':close,'open':close,'volume':close*100,'amount':close*10000}
        config=validated_config({'frequency':'monthly','horizon':1,'minTrainPeriods':12,'factors':[{'id':'momentum','lookback':2,'direction':1}]})
        _,sample_dates=build_panel(fields,config)
        self.assertEqual(sample_dates[-1],pd.Timestamp('2025-04-30'))


if __name__=='__main__':
    unittest.main(verbosity=2)
