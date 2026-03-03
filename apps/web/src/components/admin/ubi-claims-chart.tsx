"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface DailyMetric {
  date: string;
  claimCount: number;
  uniqueUsers: number;
  totalAmount: string;
}

interface UbiClaimsChartProps {
  data: DailyMetric[];
  loading: boolean;
}

export function UbiClaimsChart({ data, loading }: UbiClaimsChartProps) {
  if (loading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Daily Claims Trend</CardTitle>
          <CardDescription>UBI claims over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-muted-foreground">Loading chart...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Daily Claims Trend</CardTitle>
          <CardDescription>UBI claims over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-muted-foreground">No data available</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Format data for chart (show only last 30 days, format dates nicely)
  const chartData = data.slice(-30).map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    claims: item.claimCount,
    users: item.uniqueUsers,
  }));

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Daily Claims Trend</CardTitle>
        <CardDescription>UBI claims and unique users over the last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="date" 
                stroke="#888888"
                fontSize={12}
                tickLine={false}
              />
              <YAxis 
                stroke="#888888"
                fontSize={12}
                tickLine={false}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                }}
              />
              <Line
                type="monotone"
                dataKey="claims"
                stroke="#10b981"
                strokeWidth={2}
                name="Total Claims"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="users"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Unique Users"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
