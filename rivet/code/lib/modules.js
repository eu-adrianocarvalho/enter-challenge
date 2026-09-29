/* Carrega módulos do Node dentro de um Code node sem usar o require que o Rivet oferece: no executor do app
   desktop (Node 18 com o build CommonJS do Rivet) ligar allowRequire quebra o node com "The argument
   'filename' ... Received undefined". O import() dinâmico funciona no app e no rivet-cli, e o createRequire
   ancorado no package.json do projeto encontra o node_modules/ do repositório. */

async function projectRequire(repo) {
  const { createRequire } = await import('node:module');
  return createRequire(`${repo}/package.json`);
}
