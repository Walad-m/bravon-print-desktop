import { createRootRoute, Outlet, Link } from '@tanstack/react-router';
import { LayoutDashboard, PenTool } from 'lucide-react';
import { BravonLogo } from '../components/ui/BravonLogo';
import { usePrinterStore } from '../stores/usePrinterStore';
import '../styles/global.css';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { connectedDevice } = usePrinterStore();

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Sidebar Navigation */}
      <aside
        style={{
          width: '240px',
          backgroundColor: 'var(--color-surface)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          padding: 'var(--space-4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: 'var(--space-2) var(--space-3)',
          }}
        >
          <BravonLogo size="md" subtitleText="DESKTOP" />
        </div>

        <nav
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-6)',
          }}
        >
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-primary)',
              fontWeight: 500,
              fontSize: '0.9rem',
              transition: 'all 0.15s ease',
            }}
            activeProps={{
              style: {
                backgroundColor: 'var(--color-primary)',
                color: 'white',
              },
            }}
          >
            <LayoutDashboard size={18} />
            Dashboard
          </Link>
          <Link
            to="/designer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-primary)',
              fontWeight: 500,
              fontSize: '0.9rem',
              transition: 'all 0.15s ease',
            }}
            activeProps={{
              style: {
                backgroundColor: 'var(--color-primary)',
                color: 'white',
              },
            }}
          >
            <PenTool size={18} />
            Label Designer
          </Link>
        </nav>

        {/* Sidebar Footer: Real-time Connection Indicator */}
        <div
          style={{
            marginTop: 'auto',
            padding: '10px 12px',
            backgroundColor: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: connectedDevice ? 'var(--color-success)' : 'var(--color-warning)',
              boxShadow: connectedDevice ? '0 0 6px var(--color-success)' : undefined,
              flexShrink: 0,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--color-text-primary)',
              }}
            >
              {connectedDevice ? connectedDevice.name : 'No printer'}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
              {connectedDevice
                ? connectedDevice.deviceType === 'spooler'
                  ? 'Windows Driver'
                  : 'Bluetooth SPP'
                : 'Offline'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--color-bg)' }}>
        <Outlet />
      </main>
    </div>
  );
}
