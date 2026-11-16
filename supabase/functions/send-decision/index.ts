// Sends the acceptance / rejection email through Gmail (Apps Script webhook, NO domain needed) or Resend. Called ONLY by the admin panel.
// Deploy:  supabase functions deploy send-decision --no-verify-jwt
// Gmail Secrets (no domain needed):
//   supabase secrets set GMAIL_WEBHOOK_URL=https://script.google.com/macros/s/xxx/exec GMAIL_SECRET=your_secret ADMIN_EMAIL=nexa.am.dz@gmail.com
// Or Resend Secrets (requires verified domain):
//   supabase secrets set RESEND_API_KEY=re_xxx FROM_EMAIL="AstraMind <club@yourdomain.com>" ADMIN_EMAIL=you@mail.com
// Optional: REPLY_TO=club@mail.com  CLUB_LINK=https://chat.whatsapp.com/xxxx  SITE_URL=https://your-site.com
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function build(name: string, lang: string, status: string, link: string, site: string) {
  const ar = lang === 'ar', n = esc(name)
  const T = {
    accepted: ar
      ? { s: 'مرحباً بك في AstraMind 🎉', h: `مرحباً ${n}،`, p: 'يسعدنا إبلاغك بقبول طلب انضمامك إلى نادي AstraMind للعلوم والابتكار. أهلاً بك بيننا!', b: 'انضم إلى مجتمعنا' }
      : { s: 'Welcome to AstraMind 🎉', h: `Hi ${n},`, p: 'We are happy to let you know that your membership request to the AstraMind Science & Innovation Club has been accepted. Welcome aboard!', b: 'Join our community' },
    rejected: ar
      ? { s: 'بخصوص طلب انضمامك إلى AstraMind', h: `مرحباً ${n}،`, p: 'شكراً لاهتمامك بالنادي. لم نتمكن من قبول طلبك في الوقت الحالي، ونرحّب بك لتقديم طلب جديد في الدفعة القادمة.', b: '' }
      : { s: 'About your AstraMind request', h: `Hi ${n},`, p: 'Thank you for your interest in the club. We could not accept your request at this time, and you are welcome to apply again in the next call.', b: '' },
  }[status as 'accepted' | 'rejected']
  const btn = T.b && /^https:\/\//.test(link)
    ? `<p style="margin:26px 0"><a href="${esc(link)}" style="background:#7955C8;color:#fff;padding:13px 26px;border-radius:99px;text-decoration:none;font-weight:700">${T.b}</a></p>` : ''
  const tail = ar ? 'يمكنك الرد مباشرة على هذه الرسالة لأي استفسار.<br>— فريق AstraMind' : 'Reply to this email any time if you have a question.<br>— The AstraMind team'
  const html = `<div dir="${ar ? 'rtl' : 'ltr'}" style="font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f5f4f0;padding:28px"><div style="max-width:520px;margin:auto;background:#fff;border-radius:18px;padding:32px;color:#101D3A;line-height:1.8"><div style="font-size:22px;font-weight:800;margin-bottom:14px">AstraMind ✳</div><p style="font-size:18px;margin:0 0 8px"><b>${T.h}</b></p><p style="margin:0">${T.p}</p>${btn}<p style="color:#5b6785;font-size:14px;margin:24px 0 0">${tail}</p>${site ? `<p style="font-size:12px;color:#9aa5bd;margin-top:20px">${esc(site)}</p>` : ''}</div></div>`
  return { subject: T.s, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization'), key = req.headers.get('apikey')
    if (!auth || !key) return json({ error: 'unauthorized' }, 401)
    const db = createClient(Deno.env.get('SUPABASE_URL')!, key, { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
    const admin = (Deno.env.get('ADMIN_EMAIL') || '').trim().toLowerCase()
    if (!user || !admin || (user.email || '').toLowerCase() !== admin) return json({ error: 'forbidden' }, 403)

    const { id, status } = await req.json()
    if (!['accepted', 'rejected'].includes(status)) return json({ error: 'bad status' }, 400)
    const { data: r, error } = await db.from('requests').select('id,name,email,lang').eq('id', id).single()   // RLS: admin only
    if (error || !r) return json({ error: 'request not found' }, 404)

    const m = build(r.name, r.lang, status, Deno.env.get('CLUB_LINK') || '', Deno.env.get('SITE_URL') || '')
    const reply = Deno.env.get('REPLY_TO')
    const gmailUrl = Deno.env.get('GMAIL_WEBHOOK_URL')

    if (gmailUrl) {
      const res = await fetch(gmailUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: Deno.env.get('GMAIL_SECRET') || '',
          to: r.email,
          subject: m.subject,
          html: m.html,
          replyTo: reply || admin,
        }),
      })
      const txt = await res.text()
      let parsed: { ok?: boolean; error?: string } | null = null
      try { parsed = JSON.parse(txt) } catch { /* ignore */ }
      if (!res.ok || !parsed?.ok) {
        return json({ error: 'gmail_failed', detail: (parsed?.error || txt).slice(0, 300) }, 502)
      }
    } else {
      const resendKey = Deno.env.get('RESEND_API_KEY')
      if (!resendKey) return json({ error: 'missing_email_provider' }, 500)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: Deno.env.get('FROM_EMAIL'), to: [r.email], subject: m.subject, html: m.html, ...(reply ? { reply_to: [reply] } : {}) }),
      })
      if (!res.ok) return json({ error: 'resend_failed', detail: (await res.text()).slice(0, 300) }, 502)
    }

    await db.from('requests').update({ notified_at: new Date().toISOString() }).eq('id', id)
    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
