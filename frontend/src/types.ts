export type User = {
  id: number;
  name: string;
  email: string;
  role: "coordinator" | "grower";
};
export type Plot = {
  id: string;
  name: string;
  grower_id: number;
  crop: string;
  area: string;
  position: number;
  active: boolean;
};
export type Source = {
  opening_ml: number;
  flow_ml_min: number;
  start: number;
  end: number;
  changeover: number;
  timezone: string;
};
export type RequestRecord = {
  id: number;
  plot_id: string;
  name: string;
  grower_id: number;
  grower_name: string;
  crop: string;
  area: string;
  position: number;
  requested_ml: number;
  approved_ml: number;
  minimum_ml: number;
  start: number;
  end: number;
  note: string;
  status: string;
  reason: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewer_id: number | null;
  updated_at: string;
};
export type Allocation = RequestRecord & {
  allocated_ml: number | null;
  fulfillment: number;
  baseline_ml: number;
  explanation: string;
};
export type Scheduled = {
  plot_id: string;
  grower_id: number;
  start: number;
  end: number;
  allocated_ml: number;
};
export type Snapshot = {
  revision: number;
  preset: string;
  source: Source;
  policy: string;
  requests: RequestRecord[];
  rows: Allocation[];
  schedule: Scheduled[];
  feasible: boolean;
  errors: string[];
  totals: {
    requested_ml: number;
    approved_ml: number;
    allocated_ml: number;
    scheduled_ml: number;
    unmet_ml: number;
    unused_ml: number;
  };
};
export type Plan = {
  id: number;
  revision: number;
  status: string;
  created_at: string;
  published_at: string | null;
  snapshot: Snapshot;
};
export type Turn = Scheduled & {
  id: number;
  sequence: number;
  target_ml: number;
  state: string;
  actual_ml: number;
  actual_start: string | null;
  actual_finish: string | null;
  reason: string;
};
export type Accounting = {
  opening_ml: number;
  adjustment_ml: number;
  delivered_ml: number;
  balance_ml: number;
  remaining_plan_ml: number;
  remaining_shortfall_ml: number;
  delivery_shortfall_ml: number;
  finalized_shortfall_ml: number;
};
export type Day = {
  date: string;
  state: string;
  revision: number;
  source: Source;
  policy: string;
  requests: RequestRecord[];
  plan: Plan | null;
  draft: Plan | null;
  history: Plan[];
  turns: Turn[];
  accounting: Accounting;
  activity: {
    id: number;
    actor: string;
    action: string;
    detail: string;
    data: Record<string, unknown>;
    created_at: string;
  }[];
};
export type Bootstrap = {
  plots: Plot[];
  growers: User[];
  days: { date: string; state: string }[];
};
export type Config = {
  demo: boolean;
  community: string;
  today: string;
  timezone: string;
};
export type Mutate = (
  path: string,
  body: Record<string, unknown>,
  method?: string,
) => Promise<void>;
