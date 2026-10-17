"""Pure integer allocation and exhaustive single-hose scheduling. No database dependencies."""
from itertools import permutations
from datetime import datetime


def litres(ml):
    return f'{ml / 1000:.3f}'.rstrip('0').rstrip('.')


def proportional(demands, water):
    total = sum(demands.values())
    usable = min(water, total)
    if not total:
        return {key: 0 for key in demands}
    result = {key: usable * value // total for key, value in demands.items()}
    order = sorted(demands, key=lambda key: (-(usable * demands[key] % total), key))
    for key in order[:usable - sum(result.values())]:
        result[key] += 1
    return result


def allocate(requests, water, policy):
    approved = [r for r in requests if r['status'] == 'approved']
    demand = {r['plot_id']: r['approved_ml'] for r in approved}
    minimums = {r['plot_id']: r['minimum_ml'] for r in approved}
    minimum_total = sum(minimums.values())
    if policy == 'minimums' and water < minimum_total:
        return {}, [f'Agreed minimums need {litres(minimum_total)} L; only {litres(water)} L is available. Change the policy, minimums, or source budget.']
    if policy == 'minimums':
        remainder = proportional({k: v - minimums[k] for k, v in demand.items()}, water - minimum_total)
        return {k: minimums[k] + remainder[k] for k in demand}, []
    return proportional(demand, water), []


def schedule(requests, allocations, source):
    positive = sorted([r for r in requests if allocations.get(r['plot_id'], 0) > 0], key=lambda r: r['plot_id'])
    if len(positive) > 6:
        return [], ['At most six plots can be scheduled.']
    durations = {r['plot_id']: (60 * allocations[r['plot_id']] + source['flow_ml_min'] - 1) // source['flow_ml_min'] for r in positive}
    errors = []
    for r in positive:
        window = max(0, min(r['end'], source['end']) - max(r['start'], source['start']))
        duration = durations[r['plot_id']]
        if duration > window:
            errors.append(f"Plot {r['plot_id']}: this allocation needs {duration / 60:g} minutes; the available window is {window / 60:g} minutes.")
    if errors:
        return [], errors
    best, best_key = None, None
    for order in permutations(positive):
        cursor, turns = source['start'], []
        for r in order:
            start = max(cursor, r['start'])
            end = start + durations[r['plot_id']]
            if end > min(r['end'], source['end']):
                break
            turns.append({'plot_id': r['plot_id'], 'grower_id': r['grower_id'], 'start': start, 'end': end, 'allocated_ml': allocations[r['plot_id']]})
            cursor = end + source['changeover']
        else:
            key = (turns[-1]['end'] if turns else source['start'], tuple(r['plot_id'] for r in order))
            if best_key is None or key < best_key:
                best, best_key = turns, key
    if best is None:
        return [], ['The combined availability windows cannot accommodate all turns and hose changeovers. Adjust windows, flow, hours, or supply.']
    return best, []


def calculate(requests, source, policy):
    allocations, errors = allocate(requests, source['opening_ml'], policy)
    turns, scheduling_errors = schedule(requests, allocations, source) if not errors else ([], [])
    approved = [r for r in requests if r['status'] == 'approved']
    total = sum(r['approved_ml'] for r in approved)
    remaining, baseline = source['opening_ml'], {}
    for r in sorted(approved, key=lambda r: (datetime.fromisoformat(r['submitted_at']), r['plot_id'])):
        amount = min(remaining, r['approved_ml'])
        baseline[r['plot_id']] = amount
        remaining -= amount
    rows = []
    for r in approved:
        q, a = r['approved_ml'], allocations.get(r['plot_id'])
        if a is None:
            explanation = 'No allocation assigned: the agreed minimums cannot all be met.'
        elif policy == 'minimums':
            explanation = f"Your agreed minimum is {litres(r['minimum_ml'])} L. The remaining budget is shared in proportion to remaining approved demand. Your allocation is {litres(a)} L."
        else:
            coverage = min(100, source['opening_ml'] * 100 / total) if total else 0
            explanation = f'Your approved request is {litres(q)} L. The available water covers {coverage:.1f}% of approved demand. Your allocation is {litres(a)} L.'
        rows.append({**r, 'allocated_ml': a, 'fulfillment': round(a * 100 / q, 2) if q and a is not None else 0, 'baseline_ml': baseline[r['plot_id']], 'explanation': explanation})
    allocated = sum(allocations.values())
    return {'source': source, 'policy': policy, 'requests': requests, 'rows': rows, 'schedule': turns,
            'feasible': not (errors or scheduling_errors), 'errors': errors + scheduling_errors,
            'totals': {'requested_ml': sum(r['requested_ml'] for r in requests), 'approved_ml': total,
                       'allocated_ml': allocated, 'scheduled_ml': sum(t['allocated_ml'] for t in turns),
                       'unmet_ml': total - allocated, 'unused_ml': source['opening_ml'] - allocated}}
