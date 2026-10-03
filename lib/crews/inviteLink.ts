// Where an email invite's one-time link goes, and how a signed-out reader gets back to it.
//
// ⚠ THE TOKEN IS NEVER IN A PATH OR A QUERY STRING. It arrives in the URL fragment (#…), which a
// browser never sends to a server; the page then moves it into localStorage and takes it out of the
// address bar. Sign up / Log in return to the BARE page, which reads it back from storage.
//
// The first build passed `/crew-invite#<token>` as `?redirectTo=` — so for exactly the people the
// page is for (no account yet), the token reached the server in the /signup or /login request and
// sat in the address of a page that loads Google Tag Manager (Gill, 2026-10-02). Never again: the
// hrefs below are constants, and __tests__/inviteLink.test.ts pins that they carry nothing.
//
// PURE — safe for the browser, the server and tests.

export const INVITE_PAGE = '/crew-invite'

/** localStorage key holding the token between the link and the claim. Cleared once answered. */
export const INVITE_TOKEN_KEY = 'sportpool.crewInviteToken'

export const SIGN_UP_HREF = `/signup?redirectTo=${encodeURIComponent(INVITE_PAGE)}`
export const LOG_IN_HREF = `/login?redirectTo=${encodeURIComponent(INVITE_PAGE)}`

/** The link in the email: the page, and the token after the '#'. */
export function inviteLinkFor(appUrl: string, token: string): string {
  return `${appUrl}${INVITE_PAGE}#${token}`
}
