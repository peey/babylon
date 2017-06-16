// @flow

import type { Options } from "../options";
import * as N from "../types";

import type { TokContext } from "./context";
import type { Token } from "./index";
import type { TokenType } from "./types";
import { Position } from "../util/location";
import { types as ct } from "./context";
import { types as tt } from "./types";

export default class State {
  init(options: Options, input: string): void {
    this.strict = options.strictMode === false ? false : options.sourceType === "module";

    this.input = input;

    this.potentialArrowAt = -1;

    this.inMethod =
      this.inFunction =
      this.inGenerator =
      this.inAsync =
      this.inPropertyName =
      this.inType =
      this.inClass =
      this.inClassProperty =
      this.noAnonFunctionType =
        false;

    this.labels = [];

    this.decorators = [];

    this.tokens = [];

    this.comments = [];

    this.trailingComments = [];
    this.leadingComments  = [];
    this.commentStack     = [];
    // $FlowIgnore
    this.commentPreviousNode = null;

    this.pos = this.lineStart = 0;
    this.curLine = options.startLine;

    this.type = tt.eof;
    this.value = null;
    this.start = this.end = this.pos;
    this.startLoc = this.endLoc = this.curPosition();

    // $FlowIgnore
    this.lastTokEndLoc = this.lastTokStartLoc = null;
    this.lastTokStart = this.lastTokEnd = this.pos;

    this.context = [ct.braceStatement];
    this.exprAllowed = true;

    this.containsEsc = this.containsOctal = false;
    this.octalPosition = null;

    this.invalidTemplateEscapePosition = null;

    this.exportedIdentifiers = [];
  }

  // TODO
  strict: boolean;

  // TODO
  input: string;

  // Used to signify the start of a potential arrow function
  potentialArrowAt: number;

  // Flags to track whether we are in a function, a generator.
  inFunction: boolean;
  inGenerator: boolean;
  inMethod: boolean | N.MethodKind;
  inAsync: boolean;
  inType: boolean;
  noAnonFunctionType: boolean;
  inPropertyName: boolean;
  inClassProperty: boolean;
  inClass: boolean;

  // Labels in scope.
  labels: Array<{ kind: ?("loop" | "switch"), statementStart?: number }>;

  // Leading decorators.
  decorators: Array<N.Decorator>;

  // Token store.
  tokens: Array<Token | N.Comment>;

  // Comment store.
  comments: Array<N.Comment>;

  // Comment attachment store
  trailingComments: Array<N.Comment>;
  leadingComments: Array<N.Comment>;
  commentStack: Array<{
    start: number;
    leadingComments: ?Array<N.Comment>;
    trailingComments: ?Array<N.Comment>;
  }>;
  commentPreviousNode: N.Node;

  // The current position of the tokenizer in the input.
  pos: number;
  lineStart: number;
  curLine: number;

  // Properties of the current token:
  // Its type
  type: TokenType;

  // For tokens that include more information than their type, the value
  value: any;

  // Its start and end offset
  start: number;
  end: number;

  // And, if locations are used, the {line, column} object
  // corresponding to those offsets
  startLoc: Position;
  endLoc: Position;

  // Position information for the previous token
  lastTokEndLoc: Position;
  lastTokStartLoc: Position;
  lastTokStart: number;
  lastTokEnd: number;

  // The context stack is used to superficially track syntactic
  // context to predict whether a regular expression is allowed in a
  // given position.
  context: Array<TokContext>;
  exprAllowed: boolean;

  // Used to signal to callers of `readWord1` whether the word
  // contained any escape sequences. This is needed because words with
  // escape sequences must not be interpreted as keywords.
  containsEsc: boolean;

  // TODO
  containsOctal: boolean;
  octalPosition: ?number;

  // Names of exports store. `default` is stored as a name for both
  // `export default foo;` and `export { foo as default };`.
  exportedIdentifiers: Array<string>;

  invalidTemplateEscapePosition: ?number;

  curPosition(): Position {
    return new Position(this.curLine, this.pos - this.lineStart);
  }

  clone(skipArrays?: boolean): State {
    const state = new State;
    for (const key in this) {
      // $FlowIgnore
      let val = this[key];

      if ((!skipArrays || key === "context") && Array.isArray(val)) {
        val = val.slice();
      }

      // $FlowIgnore
      state[key] = val;
    }
    return state;
  }
}
