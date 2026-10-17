import random
import pytest
from backend.engine import allocate, calculate, proportional, schedule
from backend.seed import DEMAND, WINDOWS

SOURCE = {'opening_ml':160000,'flow_ml_min':2000,'start':57600,'end':64800,'changeover':120,'timezone':'Asia/Bishkek'}
def requests():
    return [{'plot_id':letter,'name':f'Plot {letter}','grower_id':i+1,'status':'approved','requested_ml':q*1000,'approved_ml':q*1000,'minimum_ml':[12,6,12,6,6,18][i]*1000,'start':WINDOWS[i][0]*60,'end':WINDOWS[i][1]*60,'submitted_at':f'2026-10-17T08:0{i}:00+06:00'} for i,(letter,q) in enumerate(zip('ABCDEF',DEMAND))]

def test_seeded_allocation_and_schedule():
    result=calculate(requests(),SOURCE,'proportional')
    assert [r['allocated_ml'] for r in result['rows']]==[40000,16000,32000,8000,24000,40000]
    assert result['totals']=={'requested_ml':240000,'approved_ml':240000,'allocated_ml':160000,'scheduled_ml':160000,'unmet_ml':80000,'unused_ml':0}
    assert [(x['plot_id'],x['start']//60,x['end']//60) for x in result['schedule']]==[('A',960,980),('B',982,990),('C',992,1008),('D',1010,1014),('E',1016,1028),('F',1030,1050)]
    assert '66.7%' in result['rows'][0]['explanation']
    assert [r['baseline_ml'] for r in result['rows']]==[60000,24000,48000,12000,16000,0]

@pytest.mark.parametrize('demand,water,expected', [({},10,{}),({'A':0},100,{'A':0}),({'A':20,'B':10},0,{'A':0,'B':0}),({'A':20,'B':10},100,{'A':20,'B':10}),({'A':10,'B':30},20,{'A':5,'B':15}),({'C':1,'B':1,'A':1},2,{'C':0,'B':1,'A':1}),({'A':1,'B':2},2,{'A':1,'B':1})])
def test_rounding_and_boundaries(demand,water,expected):
    assert proportional(demand,water)==expected

def test_volume_conservation_randomized():
    rng=random.Random(44)
    for _ in range(500):
        demands={chr(65+i):rng.randrange(0,999999) for i in range(6)}
        water=rng.randrange(0,6000000)
        result=proportional(demands,water)
        assert sum(result.values())==min(water,sum(demands.values()))
        assert all(0<=v<=demands[k] for k,v in result.items())
        assert result==proportional(dict(reversed(list(demands.items()))),water)

def test_unapproved_excluded():
    req=requests();req[0]['status']='pending';req[1]['status']='rejected'
    result=calculate(req,SOURCE,'proportional')
    assert {r['plot_id'] for r in result['rows']}==set('CDEF')
    assert result['totals']['approved_ml']==156000

def test_minimums():
    a,errors=allocate(requests(),150000,'minimums')
    assert not errors and list(a.values())==[36000,15000,30000,9000,21000,39000]
    a,errors=allocate(requests(),30000,'minimums')
    assert a=={} and '60 L' in errors[0] and '30 L' in errors[0]
    draft=calculate(requests(),{**SOURCE,'opening_ml':30000},'minimums')
    assert not draft['feasible'] and draft['schedule']==[]
    assert all(r['allocated_ml'] is None for r in draft['rows'])

def test_changed_b_order_and_no_overlap():
    req=requests();req[1].update(start=60300,end=61500)
    draft=calculate(req,SOURCE,'proportional')
    assert draft['feasible'] and [x['plot_id'] for x in draft['schedule']]!=list('ABCDEF')
    for a,b in zip(draft['schedule'],draft['schedule'][1:]):
        assert a['end']+SOURCE['changeover']<=b['start']
    for turn in draft['schedule']:
        r=next(x for x in req if x['plot_id']==turn['plot_id'])
        assert r['start']<=turn['start']<turn['end']<=r['end']

def test_short_f_preserves_allocations_without_partial_schedule():
    req=requests();req[5]['end']=61800
    draft=calculate(req,SOURCE,'proportional')
    assert not draft['feasible'] and not draft['schedule']
    assert draft['rows'][5]['allocated_ml']==40000
    assert 'needs 20 minutes' in draft['errors'][0] and '10 minutes' in draft['errors'][0]

def test_closing_time_and_combined_windows():
    req=requests()
    draft=calculate(req,{**SOURCE,'end':62000},'proportional')
    assert not draft['feasible']
    req=[{**requests()[i],'start':0,'end':180} for i in range(2)]
    turns,errors=schedule(req,{'A':1000,'B':1000},{**SOURCE,'start':0,'end':180,'changeover':150})
    assert not turns and 'combined' in errors[0]

def test_fractional_litres_round_up_to_seconds_zero_has_no_turn():
    req=requests()[:2]
    turns,errors=schedule(req,{'A':1001,'B':0},SOURCE)
    assert not errors and len(turns)==1 and turns[0]['end']-turns[0]['start']==31

def test_zero_demand_and_supply_schedules_empty():
    for req,source in [([],SOURCE),(requests(),{**SOURCE,'opening_ml':0})]:
        result=calculate(req,source,'proportional')
        assert result['feasible'] and not result['schedule']
