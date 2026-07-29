import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { Card, Button, Field, Input, Banner } from '../../design-system';
import { IconSun, IconMoon } from '../../layout/icons';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const { signIn } = useAuth();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState('owner@strideestates.co.uk');
  const [password, setPassword] = useState('stride123');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12 12 5l8 7" />
              <path d="M6.5 10.5V19h11v-8.5" />
            </svg>
          </span>
          <span className={styles.name}>Stride Estates</span>
        </div>

        <p className={styles.tagline}>Sign in to your agency</p>

        <Card>
          <form className="stack" onSubmit={submit}>
            {error && <Banner tone="danger">{error}</Banner>}

            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" value={email} autoComplete="username"
                     onChange={(e) => setEmail(e.target.value)} />
            </Field>

            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" value={password} autoComplete="current-password"
                     onChange={(e) => setPassword(e.target.value)} />
            </Field>

            <Button variant="primary" type="submit" loading={busy} block>Sign in</Button>

            <p className={styles.demo}>
              Demo accounts:<br />
              owner@strideestates.co.uk · stride123<br />
              neg@strideestates.co.uk · stride123
            </p>
          </form>
        </Card>

        <div style={{ textAlign: 'center' }}>
          <Button variant="ghost" size="sm" onClick={toggle}>
            {theme === 'light' ? <IconMoon /> : <IconSun />}
            {theme === 'light' ? 'Dark' : 'Light'}
          </Button>
        </div>
      </div>
    </div>
  );
}
