# Releasing

A version is a tag on a commit of `alpha` that passed CI. Pushing the tag publishes the image to
`ghcr.io/dawnofsoap/remidy-v2` and a GitHub release with notes written from the commit titles. Nothing
is committed for a release: no version bumps and no changelog file.

## Making one

```sh
git switch alpha && git pull
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

- **Version numbers** follow semver. Alphas are `-alpha.N`, betas `-beta.N`, and stable releases have no suffix.
- **Image tags:** every release gets its exact version, such as `0.1.0-alpha.1`, plus a channel: `alpha`, `beta`, or
  `latest` for a stable release.
- **Release notes** list features, fixes and speed improvements since the last tag, from Conventional Commit titles.
  Write titles for the person reading them.

## The first time

GitHub creates the image package as private. Make it public once, under the package's settings, so servers can pull
it without signing in.
