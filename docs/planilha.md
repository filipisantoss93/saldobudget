# Estrutura da planilha

O Saldo Budget usa uma planilha do Google como banco de dados interno.

## Abas anuais

Crie uma aba para cada período que será controlado, por exemplo:

- `2026`
- `2027`

A aplicação lista automaticamente todas as abas, exceto a aba reservada `LOG`.

## Colunas

O backend cria o cabeçalho automaticamente quando a aba está vazia.

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

## Status recomendados

- `Pendente`
- `Aprovado`
- `Finalizado`
- `Cancelado`

O comando antigo `deleteRecord` é aceito por compatibilidade, mas não apaga a linha. Ele altera o status para `Cancelado` e registra a ação no histórico.

## Aba LOG

A aba `LOG` é criada automaticamente e registra:

- data e hora;
- ação executada;
- ID do registro;
- aba de origem;
- responsável;
- dados anteriores;
- dados novos.

Não use a aba `LOG` para lançamentos manuais.

## Configuração do Apps Script

1. Abra a planilha no Google Planilhas.
2. Acesse **Extensões → Apps Script**.
3. Copie o conteúdo de `apps-script/Code.gs` para o editor.
4. Abra **Configurações do projeto → Propriedades do script**.
5. Crie a propriedade:

```text
SPREADSHEET_ID = ID_DA_SUA_PLANILHA
```

O ID é o trecho localizado entre `/d/` e `/edit` na URL da planilha.

6. Clique em **Implantar → Nova implantação**.
7. Selecione **Aplicativo da Web**.
8. Execute como sua conta.
9. Defina o acesso conforme as contas internas que utilizarão o sistema.
10. Copie a URL final terminada em `/exec`.

## Integridade dos dados

O backend aplica as seguintes proteções:

- ID único gerado pelo servidor;
- cálculo de `Total = peças + mão de obra` no servidor;
- rejeição de valores negativos;
- bloqueio contra gravações simultâneas;
- cancelamento lógico em vez de exclusão física;
- registro automático das alterações.

Mesmo sendo uma ferramenta interna, mantenha uma rotina de backup da planilha.