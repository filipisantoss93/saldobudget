# Saldo Budget

Sistema web interno para controle do saldo de cortesia (Budget) da Volkswagen utilizado pelo pós-vendas da Comasa Volkswagen.

## Objetivo

Centralizar o controle das OSs de cortesia, permitindo acompanhar saldo disponível, despesas com peças e mão de obra e sincronizar os lançamentos com uma planilha do Google.

## Contexto de acesso

A aplicação foi planejada para uso interno. O endereço não será divulgado publicamente e, nesta primeira versão, não haverá um sistema complexo de autenticação.

Mesmo nesse contexto, o projeto preserva a integridade dos dados com IDs únicos, validação no servidor, bloqueio de gravações simultâneas, cancelamento lógico e histórico de alterações.

## Tecnologias

- HTML
- CSS
- JavaScript
- Google Apps Script
- Google Planilhas
- Vercel

## Funcionalidades previstas

- Dashboard com saldo disponível
- Cadastro e edição de OS
- Controle de peças e mão de obra
- Busca e filtros
- Indicadores financeiros
- Separação por ano utilizando abas da planilha
- Sincronização com Google Planilhas
- Histórico de alterações
- Cancelamento de registros sem exclusão definitiva

## Estrutura atual

```text
saldobudget/
├── apps-script/
│   └── Code.gs
├── docs/
│   └── planilha.md
├── .gitignore
├── README.md
└── vercel.json
```

Os arquivos da interface serão adicionados ao repositório quando o protótipo HTML for incorporado ao projeto.

## Proteções de integridade implementadas

O backend do Apps Script inclui:

- geração de ID único pelo servidor;
- cálculo do total no servidor;
- rejeição de valores negativos;
- localização de registros por ID, sem depender do número da linha;
- `LockService` para impedir conflitos entre gravações simultâneas;
- cancelamento lógico em vez de apagar linhas;
- aba `LOG` com histórico de criação, atualização e cancelamento;
- tratamento padronizado de erros em JSON.

## Configuração

Consulte [`docs/planilha.md`](docs/planilha.md) para criar as abas, configurar a propriedade `SPREADSHEET_ID` e publicar o Google Apps Script como aplicativo da Web.

## API do Apps Script

A API aceita as seguintes ações:

| Ação | Método recomendado | Finalidade |
|---|---|---|
| `health` | GET | Verificar se a API responde |
| `listSheets` ou `sheets` | GET/POST | Listar abas disponíveis |
| `list` | GET/POST | Listar registros de uma aba |
| `saveRecord` | POST | Criar ou atualizar um registro |
| `cancelRecord` | POST | Cancelar um registro |
| `deleteRecord` | POST | Compatibilidade: cancela em vez de excluir |

## Observações operacionais

- Não altere manualmente a ordem das colunas das abas anuais.
- Não use a aba `LOG` para lançamentos.
- Mantenha cópias de segurança periódicas da planilha.
- Não armazene credenciais ou dados secretos no repositório.
- A URL do Apps Script deve ser configurada somente na interface interna.

## Status

🚧 Backend-base e documentação implementados. Interface web ainda precisa ser adicionada ao repositório.