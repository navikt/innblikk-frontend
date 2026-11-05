# Manual deployments and rollbacks

Open **Actions → Deploy → Run workflow** in GitHub.

1. Keep **Use workflow from** set to **main**. Selecting an old tag here runs
   the workflow stored at that tag, which may not support redeployments.
2. Select **dev** or **prod** under **environment**.
3. Enter an existing tag under **release_tag**, for example
   `prod-2026.11.04-120000`. Find tags on the repository's **Tags** page.
4. Click **Run workflow** and check that the deployment succeeds.

GitHub's custom `choice` inputs have fixed options; they cannot automatically list
repository tags. The release tag is therefore a text input, validated before any
build or deployment. Unknown tags fail rather than falling back to the latest
release. Run the current workflow from `main` even when deploying older code.

Tag redeployments rebuild the tagged commit with a fresh base image; they do not
reuse the original container image. They use the Dockerfile, lockfile and Nais
manifest from that commit, so old releases must still be buildable and compatible
with the current environment.

A successful prod redeployment creates a new `prod-*` deployment tag pointing to
the selected commit. Nightly prod rebuilds then stay on that commit instead of
undoing the rollback. Dev redeployments do not create promotable `dev-*` tags;
normal prod promotion still selects the latest tested deployment from `main`.

## Existing deployment modes

Leave **release_tag** blank to preserve the normal behavior:

| Trigger / environment     | Behavior                                                               |
| ------------------------- | ---------------------------------------------------------------------- |
| Push to `main`            | Run CI, build and deploy dev, create a promotable `dev-*` tag.         |
| Manual `dev`              | Build and deploy the selected workflow ref to dev.                     |
| Manual `prod` from `main` | Promote the latest tested `dev-*` container image to prod.             |
| Manual `prod-rebuild`     | Rebuild and deploy the latest `prod-*` commit with a fresh base image. |
| Nightly                   | Rebuild dev from `main` and prod from the latest `prod-*` tag.         |

Do not combine **prod-rebuild** with **release_tag**; select **prod** instead.
