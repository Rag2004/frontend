import MTMChart from '../components/MTMChart';
import PayoffGraph from '../components/PayoffGraph';

export default function Charts() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Page header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.5rem 0', borderBottom: '1px solid var(--border)',
            }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Charts</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Real-time MTM tracking and theoretical payoff analysis
                    </p>
                </div>
            </div>

            {/* MTM Chart — full width */}
            <MTMChart />

            {/* Payoff Graph — full width */}
            <PayoffGraph />
        </div>
    );
}
