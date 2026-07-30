import { Badge } from '../../design-system';
import styles from './ChainRail.module.css';

export default function ChainRail({ chain, milestones }) {
  return (
    <>
      <div className={styles.rail}>
        {chain.links.map((link, index) => (
          <div key={link.id} style={{ display: 'flex', alignItems: 'stretch' }}>
            <div
              className={[
                styles.link,
                link.is_ours && styles.ours,
                link.id === chain.weakest_link_id && styles.weakest,
              ].filter(Boolean).join(' ')}
            >
              <div className={styles.top}>
                <span className="label">
                  {index === 0 ? 'Bottom' : index === chain.links.length - 1 ? 'Top' : `Link ${index + 1}`}
                </span>
                {link.days_since_agreed !== null && (
                  <span className="faint num">{link.days_since_agreed}d</span>
                )}
              </div>

              <div>
                <p className={styles.address}>{link.address}</p>
                <p className={styles.party}>{link.party}</p>
              </div>

              {link.is_ours && <Badge tone="accent">Our instruction</Badge>}

              <div className={styles.bars}>
                {milestones.map((milestone) => {
                  const state = link.milestones[milestone.id];
                  return (
                    <span
                      key={milestone.id}
                      className={`${styles.bar} ${state === 'done' ? styles.done : state === 'active' ? styles.active : state === 'blocked' ? styles.blocked : ''}`}
                      title={`${milestone.label}: ${state || 'not started'}`}
                    />
                  );
                })}
              </div>

              <p className={`${styles.stage} ${link.blocked_at ? styles.stageBlocked : ''}`}>
                {link.blocked_at ? `Blocked: ${link.blocked_label}` : link.position_label}
              </p>

              {link.stage_note && <p className={styles.party}>{link.stage_note}</p>}

              {link.days_behind > 0 && (
                <Badge tone="warning">{link.days_behind}d behind typical</Badge>
              )}
            </div>

            {index < chain.links.length - 1 && (
              <div className={styles.joint}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={styles.legend}>
        {[['done', 'Complete'], ['active', 'In progress'], ['blocked', 'Blocked']].map(([key, label]) => (
          <span className={styles.legendItem} key={key}>
            <i className={`${styles.swatch} ${styles[key]}`} />{label}
          </span>
        ))}
        <span className={styles.legendItem} style={{ marginLeft: 'auto' }}>
          Milestones, left to right: {milestones.map((m) => m.label).join(' → ')}
        </span>
      </div>
    </>
  );
}
