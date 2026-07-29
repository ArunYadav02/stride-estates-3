import { useCallback, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useHotkey } from '../lib/hooks';
import { Avatar, Button } from '../design-system';
import CommandPalette from './CommandPalette';
import {
  IconHome, IconBuilding, IconUsers, IconCalendar, IconShield,
  IconWrench, IconFile, IconSparkle, IconSun, IconMoon, IconSearch,
} from './icons';
import styles from './AppShell.module.css';

const NAV = [
  { section: 'Agency' },
  { to: '/', label: 'Dashboard', icon: IconHome, end: true },
  { to: '/properties', label: 'Properties', icon: IconBuilding },
  { to: '/applicants', label: 'Applicants', icon: IconUsers },
  { to: '/diary', label: 'Diary', icon: IconCalendar },
  { section: 'Property care' },
  { to: '/compliance', label: 'Compliance', icon: IconShield, alertKey: 'compliance' },
  { to: '/maintenance', label: 'Maintenance', icon: IconWrench },
  { section: 'Intelligence' },
  { to: '/documents', label: 'Document search', icon: IconFile },
  { to: '/studio', label: 'Listing studio', icon: IconSparkle },
];

export default function AppShell({ alerts = {} }) {
  const { user, agency, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useHotkey('mod+k', useCallback(() => setPaletteOpen((open) => !open), []));

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.mark}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12 12 5l8 7" />
              <path d="M6.5 10.5V19h11v-8.5" />
            </svg>
          </span>
          <span>
            <span className={styles.brandName}>Stride Estates</span>
            <span className={styles.brandAgency}>{agency?.name || 'Agency'}</span>
          </span>
        </div>

        <nav className={styles.nav}>
          {NAV.map((item, i) =>
            item.section ? (
              <p className={styles.section} key={`section-${i}`}>{item.section}</p>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}
              >
                <item.icon />
                {item.label}
                {item.alertKey && alerts[item.alertKey] > 0 && (
                  <span className={`${styles.pill} ${styles.pillAlert}`}>{alerts[item.alertKey]}</span>
                )}
              </NavLink>
            )
          )}
        </nav>

        <div className={styles.foot}>
          <div className={styles.who}>
            <Avatar name={user?.name} />
            <span>
              <span className={styles.whoName}>{user?.name}</span>
              <span className={styles.whoRole} style={{ display: 'block' }}>{user?.role}</span>
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
        </div>
      </aside>

      <div>
        <header className={styles.topbar}>
          <button type="button" className={styles.searchTrigger} onClick={() => setPaletteOpen(true)}>
            <IconSearch width={14} height={14} />
            Search everything
            <span className={styles.kbd}>⌘K</span>
          </button>

          <div className="push row">
            <Button variant="ghost" size="sm" iconOnly onClick={toggle} aria-label="Switch theme">
              {theme === 'light' ? <IconMoon /> : <IconSun />}
            </Button>
          </div>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
