# Code signing (SignPath Foundation)

Status: prepared and switched off. Releases stay unsigned until SignPath Foundation accepts OpenPub and the owner finishes the setup below. Until then, the `sign` job in `.github/workflows/release.yml` is skipped and releases are built exactly as before.

## What the release workflow does once signing is on

The `check` job turns signing on when the repository variable `SIGNPATH_ORGANIZATION_ID` is set. It stops the run if that variable is set and the `SIGNPATH_API_TOKEN` secret is not.

1. `build` (the CI job in `windows.yml`) runs every test, then uploads the packaged folder `OpenPub-win32-x64` as it was built, before any test runs it.
2. `sign`, on a GitHub-hosted Windows runner:
   1. SignPath signs `OpenPub.exe` in that folder (artifact configuration `app`). The job waits for approval in SignPath, for up to 2 hours.
   2. Checks the signature and reads the certificate's subject.
   3. Builds the installer and the portable zip again from the signed folder: `node tools/package.mjs win32 --from-folder --publisher "<subject>"`. `resources/app-update.yml` now has `publisherName`, so this version installs an update only if Windows accepts the update's signature and the signer has that subject.
   4. SignPath signs the installer (artifact configuration `installer`). The job waits for a second approval.
   5. Checks the installer's signature, then runs `node tools/release-signed.js`: signing changed the installer's bytes, so this makes its `.blockmap` again and writes its new SHA-512 and size into `latest.yml`.
3. `publish` makes the draft release from the signed files. The notes carry SignPath's attribution (`tools/release-notes.js --signed`).

A rehearsal uses the test-signing policy, so it doesn't use up a release approval. Windows doesn't trust SignPath's test certificate, so for a rehearsal the workflow only checks that a signature is there. For a release, the signature must be valid.

The artifact configurations are copied in `.signpath/artifact-configurations/`. Keep them the same as the ones in SignPath. `tools/e2e-desktop.js` checks the copies against the installer name in `package.mjs` and the slugs in `release.yml`.

## What isn't signed

- `Uninstall OpenPub.exe`. NSIS makes it inside the installer while it builds the installer, and SignPath can't open an NSIS installer to sign it.
- Electron's DLLs in the program folder. SignPath Foundation signs only files built from the project's own source.

## Owner setup

1. **Apply** at https://signpath.org once 1.3.0 is published (SignPath Foundation asks for a project that has already released). Give the code signing policy page: https://sarinityx.github.io/OpenPub/code-signing-policy.html. Use MFA on GitHub and SignPath.
2. **In SignPath**, once accepted:
   - Project slug `OpenPub` (or set the variable `SIGNPATH_PROJECT_SLUG`).
   - Link the GitHub trusted build system to `sarinityx/OpenPub`.
   - Artifact configurations with the slugs `app` and `installer`. Paste the XML from `.signpath/artifact-configurations/`.
   - Signing policies `test-signing` and `release-signing` (or set `SIGNPATH_TEST_POLICY` and `SIGNPATH_RELEASE_POLICY`). The approver is sarinityx.
   - Optional pipeline policies: require GitHub-hosted runners (OpenPub uses only those). Disallowing reruns means a failed `sign` job needs a new run, not a re-run.
   - An API token for a user with the submitter role on both policies.
3. **In GitHub**, under Settings › Secrets and variables › Actions:
   - Secret `SIGNPATH_API_TOKEN`: the API token.
   - Variable `SIGNPATH_ORGANIZATION_ID`: the organisation ID from SignPath. Setting it turns signing on.
4. **The action is already allowed** (done 25 November 2026): Settings › Actions › General lists `SignPath/github-action-submit-signing-request@*` beside GitHub's own actions. The workflow pins it to a commit SHA, and Dependabot proposes updates as pull requests.
5. **Rehearse**: run Release with "Rehearsal" ticked, then approve the two test-signing requests. Check four things:
   - SignPath accepts the product name and version restrictions. The exe and installer give ProductVersion as text (`1.3.1`) and as a number (`1.3.1.0`). If SignPath compares the number, change `product-version` in both configurations, in SignPath and in the repository.
   - The zip's `resources/app-update.yml` has `publisherName`.
   - The notes have the attribution.
   - The draft has all four files.

   Then delete the draft.
6. **First signed release**: run Release, approve both requests, check the draft, publish it. Then update the website and FAQ (they still say releases are not signed), README-win.txt and `docs/STATUS.md`.

## Know before the first signed release

- **Every later release must be signed.** Installed copies of a signed release refuse an unsigned update with "The update was not installed: it is not signed by OpenPub's publisher." `tools/e2e-installer.js` checks this. If SignPath is unavailable, wait or tell users to update by hand.
- **`publisherName` is the certificate's full subject.** A renewed certificate with the same subject is fine. If the subject changes, release one version with the old certificate whose `app-update.yml` lists both subjects (`tools/update-config.js` writes one today), then switch.
- **Keep the SignPath action on the allow list, even while signing is off.** GitHub checks every action a workflow names before the run starts, including actions in jobs that would be skipped. Without the allow-list entry, the release workflow fails at startup ("startup failure") and no release can be made. The first rehearsal after the `sign` job was added showed this; with the entry, the rehearsal passed with `sign` skipped.
