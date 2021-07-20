<p>
  <h1 align="center">vscode-test-web-sample</h1>
</p>

Sample for using https://github.com/microsoft/vscode-test-web.

Continuously tested with latest changes:

- [Azure DevOps](https://dev.azure.com/vscode/vscode-test-web/_build?definitionId=15)
- [Travis](https://travis-ci.org/github/microsoft/vscode-test-web)

When making changes to `vscode-test-web` library, you should compile and run the tests in this sample project locally to make sure the tests can still run successfully.

```bash
yarn install
yarn compile
yarn test
```