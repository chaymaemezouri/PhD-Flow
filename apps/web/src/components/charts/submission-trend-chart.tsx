import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface TrendPoint {
  label: string;
  value: number;
}

export function SubmissionTrendChart({ points }: { points: TrendPoint[] }): ReactNode {
  const { t } = useTranslation();

  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t('dashboard.chartEmpty')}
      </p>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--teal)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
