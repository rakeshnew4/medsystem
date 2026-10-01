export const access="public";
export const methods=["GET"];
export default async function(req,res){
  return res.json({
    resourceType:"CapabilityStatement",
    status:"active",
    kind:"instance",
    software:{name:"CareFlow Hospital AI Assistant"},
    format:["json"],
    rest:[{
      mode:"server",
      security:{description:"FHIR Patient uses the hospital integration key; LIS result ingestion is not currently exposed until authenticated adapter verification passes."},
      resource:[
        {type:"Patient",profile:"http://hl7.org/fhir/StructureDefinition/Patient",interaction:[{code:"read"},{code:"search-type"}],searchParam:[{name:"identifier",type:"token"},{name:"name",type:"string"}]}
      ]
    }],
    extension:[{
      url:"urn:careflow:integration:lis",
      valueString:"Planned HMIS-aligned analyzer result contract: resultsRecords[].sampleId, testCode, resultValueString, resultUnits. Endpoint remains gated pending authenticated adapter verification."
    }],
    documentation:"See public/HMIS_CAREFLOW_INTEGRATION_API.md for the current FHIR contract and planned LIS interoperability boundary."
  });
}