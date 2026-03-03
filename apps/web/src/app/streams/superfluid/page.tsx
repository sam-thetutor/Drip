import { SuperfluidDashboard } from "@/components/superfluid-dashboard";

export default function SuperfluidStreamsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Superfluid Streams</h1>
        <p className="text-muted-foreground">
          View and manage your Superfluid GDA pool streams. These are flexible,
          pool-based streams using the General Distribution Agreement protocol.
        </p>
      </div>

      <SuperfluidDashboard />

      <div className="mt-12 p-6 bg-blue-50 rounded-lg border border-blue-200">
        <h2 className="text-lg font-semibold mb-2 text-blue-900">About Superfluid GDA Pools</h2>
        <p className="text-sm text-blue-800 mb-3">
          These streams use Superfluid's General Distribution Agreement (GDA) for flexible
          pool-based distribution. Unlike traditional point-to-point streams, GDA pools allow:
        </p>
        <ul className="text-sm text-blue-800 space-y-1 ml-4 list-disc">
          <li>Dynamic adjustment of distribution rates</li>
          <li>Multiple recipients sharing from a single pool</li>
          <li>Real-time accrual and claiming</li>
          <li>Efficient gas usage for multi-recipient distributions</li>
        </ul>
        <p className="text-xs text-blue-700 mt-4">
          Note: GDA pools are not visible on the Superfluid dashboard, which only shows
          direct CFA streams. This custom dashboard gives you full visibility into your GDA earnings.
        </p>
      </div>
    </div>
  );
}
