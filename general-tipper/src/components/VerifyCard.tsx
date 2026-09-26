import type { VerificationReport } from '../lib/verifier.ts'

type Props = {
  report?: VerificationReport
  verifying: boolean
  onVerify: () => void
}

export function VerifyCard({ report, verifying, onVerify }: Props) {
  return (
    <section className="card">
      <h2>5. Verify</h2>
      <p className="hint">
        The client re-resolves the tipped URI and checks that the on-chain event matches what the profile and its
        host advertise right now.
      </p>
      {report && (
        <>
          <p className={`verdict ${report.ok ? 'ok' : 'bad'}`}>
            {report.ok ? 'All checks passed' : 'Some checks failed'}
            <span className="hint">
              {' '}
              (against {report.origin} at {new Date(report.verifiedAt).toLocaleTimeString()})
            </span>
          </p>
          <ul className="checks">
            {report.checks.map((c) => (
              <li key={c.id} className={c.pass ? 'pass' : 'fail'}>
                <span className="mark">{c.pass ? '✓' : '✗'}</span>
                <div>
                  <div>{c.label}</div>
                  {!c.pass && (
                    <div className="hint">
                      expected <code>{c.expected}</code>, got <code>{c.actual}</code>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" onClick={onVerify} disabled={verifying}>
        {verifying ? 'Verifying…' : report ? 'Verify again' : 'Verify'}
      </button>
    </section>
  )
}
