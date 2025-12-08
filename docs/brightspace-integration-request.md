# Brightspace OAuth 2.0 Integration Request

## What We Need

We're looking to integrate PeerEval (a peer evaluation tool for student group projects) with Brightspace, similar to how Gradescope is integrated. This would allow instructors to sync their course rosters directly from Brightspace instead of manually uploading student lists.

## Request

Could you register an OAuth 2.0 application for PeerEval in Brightspace?

**Location:** Admin Tools → Manage Extensibility → OAuth 2.0

### Application Details

| Field | Value |
|-------|-------|
| **Application Name** | PeerEval |
| **Redirect URI** | `https://peerevals.app/api/auth/brightspace/callback` |
| **Scope** | `classlist:*:read` (minimum) |
| **Optional Scope** | `grades:*:write` (if we want grade passback later) |


### What We Need Back

1. **Client ID**
2. **Client Secret**
3. **Brightspace Instance URL** (confirm it's `https://mycourses.rit.edu`)

## What This Integration Does

- **Roster Sync**: Instructors can pull their enrolled students directly from their Brightspace course into PeerEval
- **No student passwords**: Students would still log into PeerEval separately (or we could add Shibboleth SSO later)
- **Read-only access**: We're only reading the classlist, not modifying anything in Brightspace

## Security Notes

- OAuth tokens are stored encrypted and per-instructor
- We only request the minimum scopes needed
- Instructors must explicitly authorize the connection
- Works alongside existing Shibboleth authentication (OAuth is just for API access)

## Future Possibilities

If this works well, we could later add:
- Grade passback (push peer evaluation scores to Brightspace gradebook)
- LTI integration for single sign-on

## Questions?

Happy to discuss or demo the application. This is the same type of integration Gradescope uses for roster sync.
