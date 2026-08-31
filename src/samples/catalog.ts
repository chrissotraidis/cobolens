export type SampleScale = "Quick tour" | "Medium" | "Integration" | "Large system";

export type SampleGuideStop = {
  label: string;
  nodeId: string;
};

export type SampleDefinition = {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  scale: SampleScale;
  focus: string;
  fileCount: number;
  nodeCount: number;
  graphUrl: string;
  sourceUrl: string;
  rootLabel: string;
  provenance: string;
  repositoryUrl?: string;
  license: string;
  guide: {
    title: string;
    description: string;
    stops: SampleGuideStop[];
    footnote: string;
  };
};

export const SAMPLE_CATALOG: SampleDefinition[] = [
  {
    id: "m6-lineage",
    name: "Lineage quick tour",
    eyebrow: "Cobolens fixture",
    description: "A compact job-to-program trace designed to teach the evidence loop in a few minutes.",
    scale: "Quick tour",
    focus: "JCL, copybooks, datasets, and a CICS service call",
    fileCount: 4,
    nodeCount: 28,
    graphUrl: "/samples/m6-lineage-graph.json",
    sourceUrl: "/samples/m6-lineage-source.json",
    rootLabel: "Sample · Lineage quick tour",
    provenance: "Created for Cobolens",
    license: "Cobolens project license",
    guide: {
      title: "From job to service",
      description: "Follow one customer input from JCL into COBOL and out to a service call.",
      stops: [
        { label: "Start at the DAILYLN job", nodeId: "job:DAILYLN" },
        { label: "Trace the customer dataset", nodeId: "dataset:BANK.CUSTOMER.MASTER" },
        { label: "Follow LINK RATEAPI", nodeId: "cics:LINEAGE/40:RATEAPI" },
      ],
      footnote: "Open Dependencies for the exact edge, then Source for proof.",
    },
  },
  {
    id: "ibm-zopen-batch",
    name: "Customer report batch",
    eyebrow: "IBM Z Open Editor sample",
    description: "A medium IBM Enterprise COBOL project with compile/run JCL, shared copybooks, and report output.",
    scale: "Medium",
    focus: "Cross-program calls, report data, copybook resolution, and JCL",
    fileCount: 23,
    nodeCount: 286,
    graphUrl: "/samples/ibm-zopen-batch-graph.json",
    sourceUrl: "/samples/ibm-zopen-batch-source.json",
    rootLabel: "Sample · IBM customer report",
    provenance: "IBM/zopeneditor-sample",
    repositoryUrl: "https://github.com/IBM/zopeneditor-sample",
    license: "Apache-2.0",
    guide: {
      title: "From batch job to report data",
      description: "Start with the run job, then follow the main program into its transaction layout.",
      stops: [
        { label: "Open the ZDERUN job", nodeId: "job:ZDERUN" },
        { label: "Inspect the SAM1 program", nodeId: "prog:SAM1" },
        { label: "Open the TRANREC copybook", nodeId: "copy:TRANREC" },
      ],
      footnote: "Parse Health records fallback warnings from the original IBM source.",
    },
  },
  {
    id: "zosconnect-api-requester",
    name: "Claims API requester",
    eyebrow: "IBM z/OS Connect sample",
    description: "CICS and IMS COBOL programs that call a REST API through z/OS Connect request and response copybooks.",
    scale: "Integration",
    focus: "CICS, IMS, generated API copybooks, JCL, and external calls",
    fileCount: 11,
    nodeCount: 188,
    graphUrl: "/samples/zosconnect-api-requester-graph.json",
    sourceUrl: "/samples/zosconnect-api-requester-source.json",
    rootLabel: "Sample · z/OS Connect claims API",
    provenance: "zosconnect/zosconnect-sample-cobol-apirequester",
    repositoryUrl: "https://github.com/zosconnect/zosconnect-sample-cobol-apirequester",
    license: "Apache-2.0",
    guide: {
      title: "From CICS claim to REST call",
      description: "Follow the CICS entry point through its generated request layout and communication stub.",
      stops: [
        { label: "Start at CLAIMCI0", nodeId: "prog:CLAIMCI0" },
        { label: "Inspect the CLAIMREQ copybook", nodeId: "copy:CLAIMREQ" },
        { label: "Follow the communication stub", nodeId: "prog:COMM-STUB-PGM-NAME" },
      ],
      footnote: "Use Source to separate real API plumbing from unresolved external names.",
    },
  },
  {
    id: "aws-carddemo",
    name: "CardDemo system",
    eyebrow: "AWS mainframe modernization sample",
    description: "A large credit-card application with online CICS flows, batch jobs, VSAM, DB2, IMS, and MQ extensions.",
    scale: "Large system",
    focus: "Scale, dense lineage, mixed subsystems, and parser recovery",
    fileCount: 152,
    nodeCount: 6139,
    graphUrl: "/samples/aws-carddemo-graph.json",
    sourceUrl: "/samples/aws-carddemo-source.json",
    rootLabel: "Sample · AWS CardDemo",
    provenance: "aws-samples/aws-mainframe-modernization-carddemo",
    repositoryUrl: "https://github.com/aws-samples/aws-mainframe-modernization-carddemo",
    license: "Apache-2.0",
    guide: {
      title: "From statement job to account data",
      description: "Use one batch path as an anchor before exploring the wider card-processing system.",
      stops: [
        { label: "Start at CREASTMT", nodeId: "job:CREASTMT" },
        { label: "Inspect statement program CBSTM03A", nodeId: "prog:CBSTM03A" },
        { label: "Trace the account VSAM dataset", nodeId: "dataset:AWS.M2.CARDDEMO.ACCTDATA.VSAM.KSDS" },
      ],
      footnote: "This sample is intentionally large; focus slices keep the map readable.",
    },
  },
];

export const DEFAULT_SAMPLE_ID = SAMPLE_CATALOG[0].id;

export function sampleById(id: string) {
  return SAMPLE_CATALOG.find((sample) => sample.id === id);
}

export function sampleForRoot(root: string) {
  return SAMPLE_CATALOG.find((sample) => sample.rootLabel === root);
}

export function sampleForGraphUrl(graphUrl: string) {
  return SAMPLE_CATALOG.find((sample) => graphUrl.includes(sample.graphUrl));
}
