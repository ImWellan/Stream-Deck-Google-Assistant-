# Google Text Commands for Stream Deck - Installation Guide

## Document information

- Time zone: America/Toronto (Eastern Time).
- The preparation date, 2026-09-15, uses UTC-04:00.
- This file is saved as UTF-8 without BOM.
- The text intentionally uses ASCII characters to prevent accent corruption in older terminals.

## What this plugin does

The plugin sends written commands to Google Assistant from a Stream Deck key. A key can contain one command or a sequence of commands and delays. A secondary press can use a separate sequence and can be configured as a long press or a double click.

## Requirements

- Windows 10 or later.
- Elgato Stream Deck 7.1 or later.
- A Google account.
- An internet connection.
- A Google Cloud project.
- A Desktop OAuth client JSON file.

## Part 1 - Install the Stream Deck plugin

### Recommended installation: package file

1. Close the Stream Deck property inspector if it is open.
2. Open `com.codex-demo.google-text-commands.streamDeckPlugin`.
3. Confirm the Stream Deck installation prompt.
4. Start or restart the Stream Deck application.
5. Open the action list and search for **Google Text Command**.
6. Drag the action to a Stream Deck key.

The installable package is built from the plugin folder at:

`C:\Users\Sam\Documents\Application\Codex\Plug-in Assistant Google\com.codex-demo.google-text-commands.sdPlugin`

### Development installation: linked folder

Use this method when developing or testing changes.

1. Open PowerShell in:

   `C:\Users\Sam\Documents\Application\Codex\Plug-in Assistant Google`

2. Install the dependencies:

   `npm install`

3. Build the plugin:

   `npm run build`

4. Validate the plugin:

   `npx @elgato/cli validate com.codex-demo.google-text-commands.sdPlugin`

5. Link the folder to Stream Deck:

   `npx @elgato/cli link .\com.codex-demo.google-text-commands.sdPlugin`

6. Restart the plugin:

   `npx @elgato/cli restart com.codex-demo.google-text-commands`

7. Confirm that the action appears in Stream Deck.

## Part 2 - Create and configure the Google Cloud project

The **Add Google account** button requires a Google Cloud project and a Desktop OAuth client. Complete this section before trying to connect an account.

### Step 1 - Create the project

1. Open https://console.cloud.google.com/.
2. Sign in with the Google account that will own the project.
3. Open the project selector at the top of the page.
4. Click **New project**.
5. Enter a name such as `Stream Deck Google Assistant`.
6. Click **Create**.
7. Select the new project.

### Step 2 - Enable the Google Assistant API

1. Open **APIs and Services**.
2. Click **Library**.
3. Search for **Google Assistant API**.
4. Open the Google result.
5. Click **Enable**.
6. Confirm that the API page shows **API enabled**.

The direct API Library link is https://console.cloud.google.com/apis/library.

### Step 3 - Configure Google Auth Platform

1. Open **Google Auth Platform**.
2. Open **Branding** or the OAuth consent screen setup.
3. Start the app registration if Google asks for it.
4. Enter an app name such as `Stream Deck Google Assistant`.
5. Select a support email address.
6. Enter a developer contact email address.
7. Choose **External** when the plugin must work with accounts outside one Google Workspace organization.
8. Choose **Internal** only when every user belongs to the same Google Workspace organization.
9. Save the configuration.

### Step 4 - Publish the OAuth application

This step changes the application from **Testing** to **In production**.

1. Open the Google Cloud project.
2. Go to **Google Auth Platform**.
3. Open **Audience**.
4. Verify that the user type is **External** if the application must work with external Google accounts.
5. Find **Publishing status**.
6. If the status is **Testing**, click **Publish app** or **Publish to production**.
7. Review the information shown by Google.
8. Confirm the publication.

Google will then show the application as **In production** instead of **Testing**. If Google requests additional verification or policy information, complete the required steps in Google Cloud before distributing the application to other users.

If the application remains in testing mode, open **Audience > Test users** and add every Google account that will be used with the plugin. A personal Google account generally needs to be listed as a test user while the application is still in testing mode.

### Step 5 - Create the Desktop OAuth client

1. Open **Google Auth Platform > Clients**.
2. Click **Create client**.
3. Select **Desktop app** as the application type.
4. Enter a name such as `Stream Deck Windows client`.
5. Click **Create**.
6. Download the JSON file immediately.

Keep the downloaded JSON private. Do not publish it or commit it to Git. Google may only display or allow the client secret download at creation time.

## Part 3 - Add the OAuth file to the plugin

1. Find the downloaded client file. Its name may look like `client_secret_123.json`.
2. Copy it to this folder:

   `C:\Users\Sam\Documents\Application\Codex\Plug-in Assistant Google\com.codex-demo.google-text-commands.sdPlugin`

3. Rename the copied file to:

   `google-oauth.json`

4. The final path must be:

   `C:\Users\Sam\Documents\Application\Codex\Plug-in Assistant Google\com.codex-demo.google-text-commands.sdPlugin\google-oauth.json`

5. Do not place the file beside the `.sdPlugin` folder.
6. Do not replace the real file with `google-oauth.example.json`. The example file is only a template.

The package and source archive exclude the private `google-oauth.json` file. Keep the real file in the local plugin folder.

You can use the `GOOGLE_ASSISTANT_CLIENT_FILE` environment variable to specify another JSON path, but the default path above is recommended.

## Part 4 - Connect the Google account

1. Restart Stream Deck after adding `google-oauth.json`.
2. Add **Google Text Command** to a Stream Deck key.
3. Open the key configuration panel.
4. Scroll to **Google account**.
5. Click **Add Google account**.
6. Complete the Google sign-in in the browser window.
7. Review and accept the requested permissions.
8. Return to Stream Deck after the local callback page confirms the connection.
9. Verify that the Google email address appears in the account list.
10. The selected account is the account used by that key.

The plugin can store several Google accounts. Use the email button to select an account, or click **Disconnect** to remove an account from the plugin.

## Part 5 - Configure commands and sequences

### Simple click

1. Open the **Simple click** section.
2. Enter the command in the text field.
3. Click the **+** button to add another step.
4. Choose **Add command** or **Add delay**.
5. Configure each step in execution order.

For example:

1. Command: `Turn on the office lights`
2. Delay: `5 seconds`
3. Command: `Turn on the television`

### Secondary press

The secondary press is disabled by default.

1. Enable **Secondary press**.
2. Choose **Long press** or **Double click**.
3. Configure its commands and delays with the same **+** button.
4. Save the key settings.

The secondary sequence is independent from the simple-click sequence.

## Persistent authentication

Refresh tokens are stored in the Windows Credential Manager through `keytar`, not in Stream Deck settings. The account normally remains connected between Stream Deck restarts.

No plugin can guarantee a connection forever. Google can revoke a token, the user can remove authorization, or Google can change OAuth requirements. When an explicit revocation is detected, the plugin removes the invalid token and asks for a new connection.

## Troubleshooting

### The Add Google account button does nothing

1. Close and reopen the action configuration panel.
2. Restart Stream Deck.
3. Confirm that the plugin is linked or installed from the current folder.
4. Confirm that the plugin process is running.
5. Confirm that `google-oauth.json` exists at the exact path in Part 3.

The plugin displays an error in the account section when it cannot contact the plugin process.

### The browser does not open

Confirm that the plugin is running and that the OAuth JSON file contains a valid Desktop client. Restart Stream Deck after changing the JSON file.

### Google blocks the sign-in

Confirm all of the following:

- The Google Assistant API is enabled.
- The OAuth application is **External** when external accounts are required.
- The application is **In production**, or the account is listed under **Test users** while it remains in testing mode.
- The OAuth client type is **Desktop app**.

### The email address is not displayed

The OAuth request must include the OpenID, email, and profile scopes. Disconnect the account and connect it again if the account was authorized before these scopes were enabled.

## Updating the plugin

For a packaged installation, install the newer `.streamDeckPlugin` package and restart Stream Deck.

For a linked development installation, run:

`npm run build`

Then restart the plugin:

`npx @elgato/cli restart com.codex-demo.google-text-commands`

## Removing the plugin

1. Remove the Google Text Command actions from Stream Deck profiles.
2. Uninstall the plugin from Stream Deck settings, or run the CLI unlink command for a linked development installation.
3. If desired, disconnect the Google account from the action configuration before uninstalling.
4. To revoke Google access completely, remove the application authorization from the Google account security settings.

## Important files

- `com.codex-demo.google-text-commands.streamDeckPlugin`: installable package.
- `com.codex-demo.google-text-commands.sdPlugin`: plugin folder.
- `google-oauth.example.json`: template only.
- `google-oauth.json`: private local OAuth client file; never distribute it.
- `src`: TypeScript source code.
- `package.json` and `package-lock.json`: development dependencies and scripts.

## Official references

- Google Assistant project setup: https://developers.google.com/assistant/sdk/guides/configure-developer-project
- Google Cloud API Library: https://console.cloud.google.com/apis/library
- Google OAuth client management: https://support.google.com/cloud/answer/15549257
