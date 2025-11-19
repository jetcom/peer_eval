// SAML Configuration for RIT SSO
// You'll need to get these values from RIT IT

module.exports = {
  // Set to true to enable SSO
  enabled: process.env.SSO_ENABLED === 'true' || true,

  // Your application's callback URL (where RIT sends the SAML response)
  callbackUrl: process.env.SSO_CALLBACK_URL || 'http://localhost:3001/api/sso/callback',

  // Your application's entity ID (unique identifier for your app)
  issuer: process.env.SSO_ISSUER || 'peer-eval-app',

  // RIT's Identity Provider settings
  // Get these from RIT IT when you register your application
  entryPoint: process.env.SSO_ENTRY_POINT || 'https://shibboleth.rit.edu/idp/profile/SAML2/Redirect/SSO',

  // RIT's IdP certificate (get from RIT IT or their metadata)
  // This is a placeholder - replace with actual RIT certificate
  cert: process.env.SSO_IDP_CERT || `MIIDXTCCAkWgAwIBAgIJAJC1HiIAZAiUMA0Gcreplacethiswithactualcert`,

  // Attribute mappings - these map RIT's SAML attributes to user fields
  // Common RIT attributes:
  // - urn:oid:0.9.2342.19200300.100.1.1 (uid)
  // - urn:oid:0.9.2342.19200300.100.1.3 (mail)
  // - urn:oid:2.5.4.42 (givenName)
  // - urn:oid:2.5.4.4 (sn - surname)
  // - urn:oid:2.16.840.1.113730.3.1.241 (displayName)
  attributeMapping: {
    email: 'urn:oid:0.9.2342.19200300.100.1.3',
    uid: 'urn:oid:0.9.2342.19200300.100.1.1',
    firstName: 'urn:oid:2.5.4.42',
    lastName: 'urn:oid:2.5.4.4',
    displayName: 'urn:oid:2.16.840.1.113730.3.1.241'
  }
};

/*
 * SETUP INSTRUCTIONS FOR RIT IT:
 *
 * 1. Contact RIT IT to register your application as a SAML Service Provider
 *
 * 2. Provide them with:
 *    - Entity ID: peer-eval-app (or your chosen identifier)
 *    - ACS URL: https://your-domain.com/api/sso/callback
 *    - Required attributes: mail, displayName (or givenName + sn)
 *
 * 3. They will provide:
 *    - IdP Entry Point URL
 *    - IdP Certificate
 *    - IdP Metadata XML
 *
 * 4. Set environment variables:
 *    SSO_ENABLED=true
 *    SSO_CALLBACK_URL=https://your-domain.com/api/sso/callback
 *    SSO_ISSUER=peer-eval-app
 *    SSO_ENTRY_POINT=<from RIT>
 *    SSO_IDP_CERT=<from RIT>
 */
