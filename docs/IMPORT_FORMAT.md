# Import format

Imports are parsed in the browser tab only. Nothing is uploaded. Files over 512 KB are refused. The same four checks run on imported data as on the seed.

## CSV

Header (all eight columns required, any order):

```
record,slice,type,name,action,origin,depends_on,detail
```

`detail` holds `key=value` pairs separated by `;`. `depends_on` holds `Type:ApiName` keys separated by `;`.

| record | Columns used | detail keys |
|---|---|---|
| `target` | `name` = `Type:ApiName` already in the target org | none |
| `slice` | `slice` id, `name` = display name | `atomic=true\|false`, `description=…` |
| `change` | `slice`, `type` (metadata type), `name` (API name), `action` (`add`/`modify`/`delete`), `origin` (`human`/`ai-assisted`), `depends_on` | `summary`, `author`, `test=true`, and for fields `before=`, `after=`, `populated=` |
| `permission` | `slice`, `type` (`object`/`field`/`system`), `name` (target, e.g. `Case` or `Case.Status`) | `set=`, `before=`, `after=`, `assigned=` |
| `test` | `slice`, `type` (`apex`/`flow`/`agent-conversation`/`prompt`), `name`, `depends_on` = components covered | `scenario=happy-path\|negative\|permission`, `result=pass\|fail\|not-run`, `coverage=0-100` |

Supported metadata types: `CustomObject`, `CustomField`, `ApexClass`, `ApexTrigger`, `Flow`, `PermissionSet`, `GenAiPlannerBundle`, `GenAiPlugin`, `GenAiFunction`, `GenAiPromptTemplate`.

Field shapes: `Text(255)`, `Number(5)`, `Picklist(Gold|Silver)`, `DateTime`.

Access levels: object `none, read, edit, viewAll, modifyAll`; field `none, read, edit`; system `off, on`.

Quoted CSV cells may contain commas, doubled quotes and newlines. Errors are reported with the line number and the file is not loaded until every error is fixed. Warnings (for example, an Apex test with no coverage value) do not block import.

### Example

```csv
record,slice,type,name,action,origin,depends_on,detail
target,,,CustomObject:Quote,,,,
target,,,CustomField:Quote.Discount__c,,,,
target,,,PermissionSet:Sales_Ops,,,,
slice,quote-approval,,Quote approval threshold,,,,atomic=false;description=Raise auto-approval threshold
change,quote-approval,Flow,Quote_Approval,modify,ai-assisted,CustomField:Quote.Discount__c;CustomField:Quote.Approval_Tier__c,summary=Auto-approve up to 15%
change,quote-approval,CustomField,Quote.Approval_Tier__c,add,human,CustomObject:Quote,after=Picklist(Auto|Manager|Director)
change,quote-approval,CustomField,Quote.Discount__c,modify,human,,before=Number(5);after=Number(3);populated=918
permission,quote-approval,field,Quote.Discount__c,,,,set=Sales_Ops;before=read;after=edit;assigned=Sales Ops team (synthetic)
test,quote-approval,flow,Approves 12% discount,,,Flow:Quote_Approval,scenario=happy-path;result=pass
```

This sample is downloadable from the Import panel. It produces three findings: a destructive length change on a populated field, a permission widening and happy-path-only tests on an AI-assisted Flow.

## JSON

The `Release` shape in [`src/engine/types.ts`](../src/engine/types.ts): `{ name, targetOrg: { name, components: string[] }, slices: Slice[] }`, where each slice has `id`, `changes[]`, and optional `permissions[]` and `tests[]`. Field names match the CSV. A sample is downloadable from the Import panel.
