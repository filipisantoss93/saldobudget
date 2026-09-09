# Estrutura da planilha

O Saldo Budget usa uma planilha do Google como banco de dados interno.

## Controles por período

Crie uma aba para cada período dos **veículos nacionais**, por exemplo:

- `2026`
- `2027`

Essas continuam sendo as abas principais e existentes. A aplicação lista automaticamente os períodos e não exige nenhuma migração dos dados atuais.

### Controle paralelo da Amarok

O saldo de cortesia da Amarok é independente do saldo de veículos nacionais.

Ao selecionar **Amarok** no painel pela primeira vez em um período, o backend cria automaticamente uma aba paralela seguindo o padrão:

- `2026 - Amarok`
- `2027 - Amarok`

A aba Amarok possui exatamente a mesma estrutura de OS da aba nacional, mas seus registros, valores utilizados, pendências, finalizações e aportes são calculados separadamente.

A interface continua mostrando apenas `2026`, `2027` etc. no seletor de período. A escolha entre **Veículos nacionais** e **Amarok** é feita pelo seletor próprio do painel.

## Colunas das OS

O backend cria o cabeçalho automaticamente quando uma aba está vazia.

| Coluna | Campo |
|---|---|
| A | ID |
| B | Criado em |
| C | OS |
| D | Placa |
| E | Modelo |
| F | Chassi |
| G | Descrição |
| H | Código da peça |
| I | Valor das peças |
| J | Valor da mão de obra |
| K | Total |
| L | Status |
| M | Observações |
| N | Responsável |
| O | Atualizado em |

Não altere a ordem dessas colunas depois que o sistema estiver em uso.

## Saldos

A aba reservada `SALDOS` registra os aportes financeiros. Cada aporte contém a aba à qual pertence, portanto:

- aportes para `2026` afetam somente **Veículos nacionais** de 2026;
- aportes para `2026 - Amarok` afetam somente **Amarok** de 2026.

O saldo inicial base de veículos nacionais usa a propriedade de script:

```text
SALDO_INICIAL
```

Se houver um saldo inicial base específico para Amarok, configure:

```text
SALDO_INICIAL_AMAROK
```

Caso `SALDO_INICIAL_AMAROK` não exista, o controle Amarok começa em `R$ 0,00` e pode receber saldo normalmente pelo botão **Adicionar saldo**.

## Status recomendados

- `Pendente`
- `Finalizado`
- `Cancelado`

## Aba LOG

A aba `LOG` registra automaticamente:

- data e hora;
- ação executada;
- ID do registro;
- aba de origem;
- responsável;
- dados anteriores;
- dados novos.

A criação automática de um controle Amarok também é registrada no histórico.

Não use a aba `LOG` para lançamentos manuais.

## Configuração do Apps Script

1. Abra a planilha no Google Planilhas.
2. Acesse **Extensões → Apps Script**.
3. Sincronize ou copie o conteúdo de `apps-script/Code.gs` para o editor.
4. Abra **Configurações do projeto → Propriedades do script**.
5. Confirme a propriedade:

```text
SPREADSHEET_ID = ID_DA_SUA_PLANILHA
```

6. Mantenha `SALDO_INICIAL` para o saldo base de veículos nacionais.
7. Configure `SALDO_INICIAL_AMAROK` apenas se quiser um saldo base inicial para Amarok.
8. Publique uma nova versão do aplicativo da Web após atualizar o Apps Script.

## Integridade dos dados

O backend aplica as seguintes proteções:

- separação física entre OS nacionais e Amarok;
- separação dos aportes por controle e período;
- ID único gerado pelo servidor;
- cálculo de `Total = peças + mão de obra` no servidor;
- rejeição de valores negativos;
- bloqueio contra gravações simultâneas;
- histórico das alterações;
- prevenção de OS duplicada dentro de cada controle.

Mesmo sendo uma ferramenta interna, mantenha uma rotina de backup da planilha.
