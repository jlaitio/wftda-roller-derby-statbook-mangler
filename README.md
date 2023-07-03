# WFTDA Roller Derby StatBook Data Mangler

A simple script to parse multiple WFTDA StatBook Excel files and aggregate the data to a single JSON file

## Usage

- Put StatBook Excel files to the `data` folder
    - Strict WFTDA file name convention does not matter but file should start with "`STATS`"
- Copy `config/config.json.sample` to `config/config.json`
    - If necessary, adjust the config
- Install dependencies
    - `npm install`
- Run the script
    - Quick start: `npx ts-node src/parser.ts`
- `output.json` appears in the root folder