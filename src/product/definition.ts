import { validateAuthorization as validate0 } from '../trade-allocation/policy'
import { validateAuthorization as validate1 } from '../risk-limit/policy'
import { validateAuthorization as validate2 } from '../valuation-snapshot/policy'
import { validateAuthorization as validate3 } from '../mandate-version/policy'
import { validateAuthorization as validate4 } from '../settlement-cycle/policy'
import { validateAuthorization as validate5 } from '../liquidity-buffer/policy'
import { validateAuthorization as validate6 } from '../counterparty-review/policy'
import { validateAuthorization as validate7 } from '../rebalance-window/policy'
import type { Entity, Field, Operation, Product } from '../workspace/types'
import { entity, number, requireThat, text } from '../workspace/values'
const roles=["Portfolio Manager","Risk Officer","Trade Operations Analyst","Chief Investment Officer"] as const
const textField=(key:string,label:string):Field=>({key,label,type:'text',required:true,initial:'Evidence pending'})
const numberField=(key:string,label:string,initial:number):Field=>({key,label,type:'number',required:true,integer:true,min:0,max:1000000000,initial})
const dateField=(key:string,label:string):Field=>({key,label,type:'date',required:true,initial:'2026-09-14'})
type Validator=(record:{measured:number;limit:number;evidence:string;revision:number})=>unknown
function workflowOperations(kind:string,label:string,validate:Validator):Operation[]{return[
  {key:kind+'-submit',label:'Submit '+label,kind,from:['draft'],roles:[roles[0]],run:({entity})=>{entity.status='review';return label+' submitted for independent review.'}},
  {key:kind+'-authorize',label:'Authorize '+label,kind,from:['review'],roles:[roles[1]],run:({entity})=>{validate({measured:number(entity.fields,'measured'),limit:number(entity.fields,'limit'),evidence:text(entity.fields,'evidence'),revision:entity.revision});entity.status='authorized';return label+' authorized against current evidence and limits.'}},
  {key:kind+'-execute',label:'Execute '+label,kind,from:['authorized'],roles:[roles[2]],run:({entity,now})=>{requireThat(text(entity.fields,'effectiveDate')<=now.slice(0,10),'The effective date has not arrived.');entity.status='active';return label+' executed with operational custody recorded.'}},
  {key:kind+'-block',label:'Block '+label,kind,from:['authorized','active'],roles:[roles[0],roles[2]],fields:[textField('reason','Blocking reason')],run:({entity,input})=>{requireThat(text(input,'reason').trim().length>=8,'A specific blocking reason is required.');entity.status='blocked';return label+' blocked without losing prior evidence.'}},
  {key:kind+'-recover',label:'Recover '+label,kind,from:['blocked'],roles:[roles[1]],fields:[textField('recovery','Recovery evidence')],run:({entity,input})=>{requireThat(text(input,'recovery').trim().length>=8,'Recovery evidence is required.');entity.status='review';return label+' returned to review with recovery evidence.'}},
  {key:kind+'-close',label:'Close '+label,kind,from:['active'],roles:[roles[3]],run:({entity})=>{entity.status='closed';return label+' closed by accountable authority.'}},
]}
const kinds=[{
    key:"trade-allocation", label:"Trade allocation capacity", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Requested allocation units",6), numberField('limit',"Available position units",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"risk-limit", label:"Portfolio risk limits", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Measured risk basis points",4), numberField('limit',"Maximum risk basis points",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"valuation-snapshot", label:"Valuation freshness", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Valuation age (minutes)",6), numberField('limit',"Maximum valuation age",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"mandate-version", label:"Investment mandate version", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Trade mandate revision",4), numberField('limit',"Approved mandate revision",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"settlement-cycle", label:"Settlement sequencing", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Completed settlement step",6), numberField('limit',"Required settlement step",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"liquidity-buffer", label:"Liquidity buffer", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Available liquidity cents",4), numberField('limit',"Minimum liquidity cents",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"counterparty-review", label:"Counterparty qualification", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Counterparty score",6), numberField('limit',"Minimum counterparty score",8), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  },
{
    key:"rebalance-window", label:"Portfolio rebalance window", states:['draft','review','authorized','active','blocked','closed'], initial:'draft', editors:[roles[0]],
    fields:[textField('owner','Accountable owner'), numberField('measured',"Execution day",4), numberField('limit',"Latest mandate day",5), textField('evidence','Evidence reference'), dateField('effectiveDate','Effective date')]
  }]
const operations:Operation[]=[...workflowOperations("trade-allocation", "Trade allocation capacity", validate0),
...workflowOperations("risk-limit", "Portfolio risk limits", validate1),
...workflowOperations("valuation-snapshot", "Valuation freshness", validate2),
...workflowOperations("mandate-version", "Investment mandate version", validate3),
...workflowOperations("settlement-cycle", "Settlement sequencing", validate4),
...workflowOperations("liquidity-buffer", "Liquidity buffer", validate5),
...workflowOperations("counterparty-review", "Counterparty qualification", validate6),
...workflowOperations("rebalance-window", "Portfolio rebalance window", validate7)]
const seed:Entity[]=[entity("trade-allocation-001","trade-allocation","Trade allocation capacity primary record",'review',{owner:"Portfolio Manager",measured:4,limit:8,evidence:"EV-QUANTDESK-001",effectiveDate:'2026-09-14'}),
entity("trade-allocation-002","trade-allocation","Trade allocation capacity recovery record",'blocked',{owner:"Trade Operations Analyst",measured:4,limit:8,evidence:"REC-QUANTDESK-001",effectiveDate:'2026-09-15'}),
entity("risk-limit-001","risk-limit","Portfolio risk limits primary record",'review',{owner:"Portfolio Manager",measured:4,limit:8,evidence:"EV-QUANTDESK-002",effectiveDate:'2026-09-14'}),
entity("risk-limit-002","risk-limit","Portfolio risk limits recovery record",'blocked',{owner:"Trade Operations Analyst",measured:4,limit:8,evidence:"REC-QUANTDESK-002",effectiveDate:'2026-09-15'}),
entity("valuation-snapshot-001","valuation-snapshot","Valuation freshness primary record",'review',{owner:"Portfolio Manager",measured:4,limit:8,evidence:"EV-QUANTDESK-003",effectiveDate:'2026-09-14'}),
entity("valuation-snapshot-002","valuation-snapshot","Valuation freshness recovery record",'blocked',{owner:"Trade Operations Analyst",measured:4,limit:8,evidence:"REC-QUANTDESK-003",effectiveDate:'2026-09-15'}),
entity("mandate-version-001","mandate-version","Investment mandate version primary record",'review',{owner:"Portfolio Manager",measured:5,limit:5,evidence:"EV-QUANTDESK-004",effectiveDate:'2026-09-14'}),
entity("mandate-version-002","mandate-version","Investment mandate version recovery record",'blocked',{owner:"Trade Operations Analyst",measured:5,limit:5,evidence:"REC-QUANTDESK-004",effectiveDate:'2026-09-15'}),
entity("settlement-cycle-001","settlement-cycle","Settlement sequencing primary record",'review',{owner:"Portfolio Manager",measured:8,limit:5,evidence:"EV-QUANTDESK-005",effectiveDate:'2026-09-14'}),
entity("settlement-cycle-002","settlement-cycle","Settlement sequencing recovery record",'blocked',{owner:"Trade Operations Analyst",measured:8,limit:5,evidence:"REC-QUANTDESK-005",effectiveDate:'2026-09-15'}),
entity("liquidity-buffer-001","liquidity-buffer","Liquidity buffer primary record",'review',{owner:"Portfolio Manager",measured:8,limit:5,evidence:"EV-QUANTDESK-006",effectiveDate:'2026-09-14'}),
entity("liquidity-buffer-002","liquidity-buffer","Liquidity buffer recovery record",'blocked',{owner:"Trade Operations Analyst",measured:8,limit:5,evidence:"REC-QUANTDESK-006",effectiveDate:'2026-09-15'}),
entity("counterparty-review-001","counterparty-review","Counterparty qualification primary record",'review',{owner:"Portfolio Manager",measured:8,limit:5,evidence:"EV-QUANTDESK-007",effectiveDate:'2026-09-14'}),
entity("counterparty-review-002","counterparty-review","Counterparty qualification recovery record",'blocked',{owner:"Trade Operations Analyst",measured:8,limit:5,evidence:"REC-QUANTDESK-007",effectiveDate:'2026-09-15'}),
entity("rebalance-window-001","rebalance-window","Portfolio rebalance window primary record",'review',{owner:"Portfolio Manager",measured:4,limit:8,evidence:"EV-QUANTDESK-008",effectiveDate:'2026-09-14'}),
entity("rebalance-window-002","rebalance-window","Portfolio rebalance window recovery record",'blocked',{owner:"Trade Operations Analyst",measured:4,limit:8,evidence:"REC-QUANTDESK-008",effectiveDate:'2026-09-15'})]
export const product:Product={name:"QuantDesk",description:"Investment portfolio and risk operations",accent:"#3346A8",actors:roles.map((role,index)=>({id:'actor-'+String(index),name:role,role})),kinds,operations,seed,
 validate:(entities)=>{for(const row of entities){requireThat(kinds.some(kind=>kind.key===row.kind),'Unknown domain record.');requireThat(typeof row.fields['owner']==='string','Every workflow requires accountable ownership.')}},
 metrics:(entities)=>[{label:'Domain records',value:String(entities.length)},{label:'Active controls',value:String(entities.filter(row=>['review','authorized','active','blocked'].includes(row.status)).length)},{label:'Blocked',value:String(entities.filter(row=>row.status==='blocked').length)},{label:'Closed',value:String(entities.filter(row=>row.status==='closed').length)}]}
