import { useTipFlow } from './hooks/useTipFlow.ts'
import { useWallet } from './hooks/useWallet.ts'
import { chain } from './lib/chain.ts'
import { ErrorBox } from './components/ErrorBox.tsx'
import { ResolveCard } from './components/ResolveCard.tsx'
import { TipForm } from './components/TipForm.tsx'
import { TxCard } from './components/TxCard.tsx'
import { UrlForm } from './components/UrlForm.tsx'
import { VerifyCard } from './components/VerifyCard.tsx'
import './App.css'

function App() {
  const wallet = useWallet()
  const { state, resolve, send, verify, reset } = useTipFlow()
  const { step, error } = state

  const showResolved = !!state.resolved
  const showTx = !!state.hash
  const showVerify = !!state.tipped

  return (
    <>
      <header className="top">
        <div>
          <h1>general-tipper</h1>
          <p className="tagline">
            Tip any web2 profile with ETH. The tip is split between the user and the server that hosts them, using
            addresses they publish themselves.
          </p>
        </div>
        <div className="top-right">
          <span className="badge">{chain.name}</span>
          {step !== 'idle' && (
            <button type="button" className="link" onClick={reset}>
              Start over
            </button>
          )}
        </div>
      </header>

      <main>
        <UrlForm busy={step === 'resolving'} disabled={showResolved} onSubmit={resolve} />
        {error?.at === 'resolving' && <ErrorBox message={error.message} />}

        {state.resolved && <ResolveCard resolved={state.resolved} />}

        {showResolved && (
          <TipForm
            wallet={wallet}
            sending={step === 'sending'}
            onSend={(amount) => wallet.account && send(wallet.account, amount)}
          />
        )}
        {error?.at === 'sending' && <ErrorBox message={error.message} />}

        {showTx && state.hash && <TxCard hash={state.hash} tipped={state.tipped} />}

        {showVerify && <VerifyCard report={state.report} verifying={step === 'verifying'} onVerify={verify} />}
        {error?.at === 'verifying' && <ErrorBox message={error.message} />}
      </main>

      <footer className="foot">
        <a href="/demo" target="_blank" rel="noreferrer">
          demo fixtures
        </a>
        {' · '}
        <a href="/.well-known/tip-router" target="_blank" rel="noreferrer">
          this site's tip-router
        </a>
      </footer>
    </>
  )
}

export default App
