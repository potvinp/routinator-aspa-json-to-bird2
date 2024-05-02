import { parseArgs } from "https://deno.land/std@0.207.0/cli/parse_args.ts";

type ASN = `AS${string}`;

interface ASA {
    customer: ASN;
    providers: ASN[];
    ta: string;
}

const printf = console.log;

const flags = parseArgs(Deno.args, {
    string: ["input", "output"],
    boolean: ["strict", "verbose", "help"],
    alias: {
        i: "input",
        o: "output",
        s: "strict",
        v: "verbose",
        h: "help"
    }
});

if (flags.help) {
    printf(`Usage: ${Deno.execPath()} [OPTIONS]
Options:
    --help,    -h   Show this menu.
    --verbose, -v   Show warnings.
    --input,   -i   The input file generated by \`routinator\`. (required) 
    --output,  -i   The file to output the BIRD2 function to.
    --strict,  -s   Consider paths without ASPA invalid (NOT RECOMMENDED).`);

    Deno.exit(0);
}

let failed = false;
if (!flags.input) {
    failed = true;
    printf("(error) `--input` flag not specified.");
}

if (!flags.output && flags.verbose) {
    printf("(warn) `--output` flag not specified.");
}

if (failed) {
    Deno.exit(1);
}

const data = await Deno.readTextFile(flags.input as string); // we know flags.input will not be undefined by this point.

const json = parseData(data);
if (!json) {
    printf(`(error) could not parse json from \`${flags.input}\``);
    Deno.exit(2);
}

const aspas: ASA[] = json.aspas;
if (!aspas) {
    printf(`(error) property \`aspas\` does not exist on the parsed JSON from \`${flags.input}\``);
    Deno.exit(3);
}

let txt = "function is_aspa_valid () {\n";

const LEADING_AS = /^AS/g;
for (const {customer, providers} of aspas) {
    const asn = customer.replace(LEADING_AS, '');

    txt += `   # does the AS path include ${customer}?\n`
    txt += `   if (bgp_path ~ [= * ${asn} * =]) then {\n`;
    txt += `       # does the AS path include [carrier's asn, ${customer}]?\n`
    for (const provider of providers) {
        const carrier = provider.replace(LEADING_AS, '');
        
        txt += `       if (bgp_path ~ [= * ${carrier} ${asn} * =]) then return true;\n`;
    }
    txt += '       return false;\n';
    txt += '   }\n\n'
}

if (flags.strict) {
    txt += '   # (strict mode) if no previous condition matches there exists no ASPA for the path; it is invalid.\n';
    txt += '   return false;\n';
} else {
    txt += '   # to avoid breaking stuff, assume the path is valid if no ASA exists.\n';
    txt += '   return true;\n';
}
txt += '}\n';

if (!flags.output) {
    console.log(txt);

    Deno.exit(0);
}

try {
    await Deno.writeTextFile(flags.output, txt);
} catch (e) {
    printf(`(error) writing to disk raised: ${e}`);
}

function parseData(data: string) {
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}