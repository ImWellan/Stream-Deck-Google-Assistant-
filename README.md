[README.md](https://github.com/user-attachments/files/32487754/README.md)
# Google Text Commands for Stream Deck

Windows Stream Deck plugin that sends written commands and delayed sequences to Google Assistant.

For installation, Google Cloud setup, OAuth configuration, production publishing, account connection, troubleshooting, updates, and removal, see `NOTES.md`.

## Persistent authentication

The plugin uses OAuth 2.0 with offline access and stores refresh tokens in the Windows Credential Manager through `keytar`. Tokens are not stored in Stream Deck settings.

Google can still revoke a token, the user can remove authorization, or OAuth rules can change. The plugin removes a token only when an explicit revocation is detected.

## Commands and sequences

The configuration supports a simple-click sequence with customizable command steps and delays. An optional secondary sequence can be configured for a long press or a double click.

Executions are serialized so that two conversations are not sent to Google Assistant at the same time.

## Development

Development commands are documented in `NOTES.md`.

The Google Assistant SDK is intended for experimental and non-commercial projects. Before public distribution, verify the Google integration path and OAuth requirements.
