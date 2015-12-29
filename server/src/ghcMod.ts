/* --------------------------------------------------------------------------------------------
 * Copyright (c) Cody Hoover. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {GhcModOpts, GhcModProcess} from './ghcModProcess';
import {
    RemoteConsole, ITextDocument, Diagnostic,
    DiagnosticSeverity, Range, Position, Files
} from 'vscode-languageserver';

export interface DiagnosticsResults {
    filepath: string;
    diagnostics: Diagnostic[];
}

export class GhcMod {
    private ghcModProcess: GhcModProcess;
    private logger: RemoteConsole;

    constructor(logger: RemoteConsole) {
        this.logger = logger;
        this.ghcModProcess = new GhcModProcess(logger);
    }

    // GHC-MOD COMMANDS
    public doCheck(document): Promise<DiagnosticsResults[]> {
        return this.ghcModProcess.runGhcModCommand(<GhcModOpts>{
            command: 'check',
            text: document.getText(),
            uri: Files.uriToFilePath(document.uri)
        }).then((lines) => {
            return this.getCheckDiagnostics(lines);
        });
    }

    public getType(document: ITextDocument, position: Position): Promise<string> {
        return this.ghcModProcess.runGhcModCommand(<GhcModOpts>{
            command: 'type',
            text: document.getText(),
            uri: Files.uriToFilePath(document.uri),
            args: [(position.line + 1).toString(), (position.character + 1).toString()]
        }).then((lines) => {
            return lines.reduce((acc, line) => {
                if (acc !== '') {
                    return acc;
                }
                // Example line: 4 1 4 17 "a -> a" 
                let tokens = line.split('"');
                let type = tokens[1] || '';
                let pos = tokens[0].trim().split(' ').map((i) => { return parseInt(i, 10) - 1; });
                let typeRange: Range;
                try {
                    typeRange = Range.create(pos[0], pos[1], pos[2], pos[3]);
                } catch (error) {
                    return acc;
                }
                let cursorLine = position.line;
                let cursorCharacter = position.character;
                if (cursorLine < typeRange.start.line || cursorLine > typeRange.end.line ||
                    cursorCharacter < typeRange.start.character || cursorCharacter > typeRange.end.character) {
                    return acc;
                }
                return type;
            }, '');
        });
    }

    public getInfo(document: ITextDocument, position: Position): Promise<string> {
        return this.ghcModProcess.runGhcModCommand(<GhcModOpts>{
            command: 'info',
            text: document.getText(),
            uri: Files.uriToFilePath(document.uri),
            args: [this.getWordAtPosition(document, position)]
        }).then((lines) => {
            let tooltip = lines.join('\n');
            if (tooltip.indexOf('Cannot show info') === -1) {
                return tooltip;
            } else {
                return '';
            }
        });
    }

    public shutdown(): void {
        this.ghcModProcess.killProcess();
    }

    // PRIVATE METHODS    
    private getCheckDiagnostics(lines: string[]): DiagnosticsResults[] {
        let results: { [key: string]: Diagnostic[] } = Object.create(null);
        lines.forEach((line) => {
            let match = line.match(/^(.*?):([0-9]+):([0-9]+): *(?:(Warning|Error): *)?/);
            if (match) {
                let filename = match[1] || '';
                if (!results[filename]) {
                    results[filename] = [];
                }
                results[filename].push({
                    severity: match[4] === 'Warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
                    range: {
                        start: { line: parseInt(match[2], 10) - 1, character: parseInt(match[3], 10) - 1 },
                        end: { line: parseInt(match[2], 10) - 1, character: parseInt(match[3], 10) - 1 }
                    },
                    message: line.replace(match[0], '')
                });
            }
        });
        return Object.keys(results).map((key) => {
           return <DiagnosticsResults> {
               filepath: key,
               diagnostics: results[key]
           };
        });
    }

    private getWordAtPosition(document: ITextDocument, position: Position): string {
        let line = document.getText().split('\n')[position.line];
        let startPosition = line.lastIndexOf(' ', position.character) + 1;
        if (startPosition < 0) {
            startPosition = 0;
        }
        let endPosition = line.indexOf(' ', position.character);
        if (endPosition < 0) {
            endPosition = line.length;
        }
        let ret = line.slice(startPosition, endPosition);
        return ret;
    }
}
