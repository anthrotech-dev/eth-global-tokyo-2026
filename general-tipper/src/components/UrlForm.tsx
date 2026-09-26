import { useState, type FormEvent } from 'react'

type Props = {
  busy: boolean
  disabled: boolean
  onSubmit: (url: string) => void
}

export function UrlForm({ busy, disabled, onSubmit }: Props) {
  const [url, setUrl] = useState('')
  const exampleUrl = 'https://fluffy.social/@totegamma'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (url.trim()) onSubmit(url.trim())
  }

  return (
    <section className="card">
      <h2>1. Who do you want to tip?</h2>
      <p className="hint">
        Paste a profile URL. The page must contain <code>ethereum:0x…</code> somewhere (for example in a Misskey or Mastodon bio).
      </p>
      <form onSubmit={submit} className="row">
        <input
          type="url"
          required
          placeholder="https://misskey.example/@alice"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={disabled}
        />
        <button type="submit" disabled={busy || disabled}>
          {busy ? 'Resolving…' : 'Resolve'}
        </button>
      </form>
      {!disabled && (
        <p className="hint">
          No profile handy? Try a real Misskey account:{' '}
          <button type="button" className="link" onClick={() => setUrl(exampleUrl)}>
            {exampleUrl}
          </button>
        </p>
      )}
    </section>
  )
}
