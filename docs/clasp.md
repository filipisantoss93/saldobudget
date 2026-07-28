# Sincronização do Google Apps Script com clasp

O repositório é a fonte principal do código do Apps Script. Alterações em `apps-script/` podem ser enviadas ao Google Apps Script localmente ou pelo GitHub Actions.

## Pré-requisitos

- Node.js 20 ou superior;
- acesso à conta Google proprietária do projeto;
- API do Google Apps Script habilitada em `script.google.com/home/usersettings`;
- projeto do Apps Script já existente e publicado como Web App.

## Configuração local inicial

Na raiz do repositório:

```bash
npm install
npx clasp login
```

No Google Apps Script, abra **Configurações do projeto** e copie o **ID do script**.

Crie um arquivo local `.clasp.json`:

```json
{
  "scriptId": "COLE_O_ID_DO_SCRIPT",
  "rootDir": "apps-script"
}
```

Esse arquivo é ignorado pelo Git e não deve ser publicado.

Confirme os arquivos que serão enviados:

```bash
npm run clasp:status
```

Envie o código:

```bash
npm run clasp:push
```

Abra o projeto remoto:

```bash
npm run clasp:open
```

## Atualização automática pelo GitHub Actions

Cadastre os seguintes secrets em **Settings → Secrets and variables → Actions**:

### `CLASPRC_JSON`

Conteúdo completo do arquivo de autenticação criado pelo `clasp login`:

```text
~/.clasprc.json
```

Esse conteúdo contém token de acesso e deve ser tratado como senha.

### `CLASP_JSON`

Use:

```json
{
  "scriptId": "ID_DO_PROJETO_APPS_SCRIPT",
  "rootDir": "apps-script"
}
```

### `CLASP_DEPLOYMENT_ID`

ID da implantação Web App atual. Ele não é a URL completa e não é o ID do script.

Para localizar:

1. abra o Apps Script;
2. acesse **Implantar → Gerenciar implantações**;
3. abra a implantação usada pelo Saldo Budget;
4. copie o ID da implantação.

O workflow `.github/workflows/deploy-apps-script.yml` executa automaticamente quando arquivos em `apps-script/` são alterados na branch `main`.

Ele realiza:

1. autenticação usando os secrets;
2. `clasp push --force`;
3. criação de uma nova versão;
4. atualização da implantação existente.

A atualização da implantação existente preserva a URL `/exec` já salva no frontend.

## Primeiro teste

Depois de configurar os secrets, abra a aba **Actions** no GitHub e execute manualmente o workflow **Deploy Google Apps Script**.

Teste a API:

```text
https://script.google.com/macros/s/SEU_DEPLOYMENT_ID/exec?action=health
```

A resposta esperada é:

```json
{
  "ok": true,
  "service": "Saldo Budget API"
}
```

## Regra operacional

Depois de ativar o fluxo pelo clasp, evite editar `Code.gs` diretamente no editor do Google. Alterações manuais podem ser sobrescritas no próximo deploy do GitHub.
