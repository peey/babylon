// @flow

import { types as tt, TokenType } from "../tokenizer/types";
import type Parser from "../parser";
import * as N from "../types";
import type { Pos, Position } from "../util/location";

function isSimpleProperty(node: N.Node): boolean {
  return node != null &&
    node.type === "Property" &&
    node.kind === "init" &&
    node.method === false;
}

export default (superClass: Class<Parser>): Class<Parser> => class extends superClass {
  estreeParseRegExpLiteral({ pattern, flags }: N.RegExpLiteral): N.Node {
    let regex = null;
    try {
      regex = new RegExp(pattern, flags);
    } catch (e) {
      // In environments that don't support these flags value will
      // be null as the regex can't be represented natively.
    }
    const node = this.estreeParseLiteral(regex);
    node.regex = { pattern, flags };

    return node;
  }

  estreeParseLiteral(value: any): N.Node {
    return this.parseLiteral(value, "Literal");
  }

  directiveToStmt(directive: N.Directive): N.ExpressionStatement {
    const directiveLiteral = directive.value;

    const stmt = this.startNodeAt(directive.start, directive.loc.start);
    const expression = this.startNodeAt(directiveLiteral.start, directiveLiteral.loc.start);

    expression.value = directiveLiteral.value;
    expression.raw = directiveLiteral.extra.raw;

    stmt.expression = this.finishNodeAt(
      expression, "Literal", directiveLiteral.end, directiveLiteral.loc.end);
    stmt.directive = directiveLiteral.extra.raw.slice(1, -1);

    return this.finishNodeAt(stmt, "ExpressionStatement", directive.end, directive.loc.end);
  }

  // ==================================
  // Overrides
  // ==================================

  checkDeclaration(node: N.Pattern): void {
    if (isSimpleProperty(node)) {
      // $FlowFixMe
      this.checkDeclaration(node.value);
    } else {
      super.checkDeclaration(node);
    }
  }

  checkGetterSetterParamCount(prop: N.ObjectMethod | N.ClassMethod): void {
    const paramCount = prop.kind === "get" ? 0 : 1;
    // $FlowFixMe (prop.value present for ObjectMethod, but for ClassMethod should use prop.params?)
    if (prop.value.params.length !== paramCount) {
      const start = prop.start;
      if (prop.kind === "get") {
        this.raise(start, "getter should have no params");
      } else {
        this.raise(start, "setter should have exactly one param");
      }
    }
  }

  checkLVal(
    expr: N.Expression,
    isBinding: ?boolean,
    checkClashes: ?{ [key: string]: boolean },
    contextDescription: string
  ): void {
    switch (expr.type) {
      case "ObjectPattern":
        expr.properties.forEach((prop) => {
          this.checkLVal(
            prop.type === "Property" ? prop.value : prop,
            isBinding,
            checkClashes,
            "object destructuring pattern"
          );
        });
        break;
      default:
        super.checkLVal(expr, isBinding, checkClashes, contextDescription);
    }
  }

  checkPropClash(prop: N.ObjectMember, propHash: { [key: string]: boolean }): void {
    if (prop.computed || !isSimpleProperty(prop)) return;

    const key = prop.key;
    // It is either an Identifier or a String/NumericLiteral
    const name = key.type === "Identifier" ? key.name : String(key.value);

    if (name === "__proto__") {
      if (propHash.proto) this.raise(key.start, "Redefinition of __proto__ property");
      propHash.proto = true;
    }
  }

  isStrictBody(node: { body: N.BlockStatement }, isExpression?: boolean): boolean {
    if (!isExpression && node.body.body.length > 0) {
      for (const directive of node.body.body) {
        if (directive.type === "ExpressionStatement" && directive.expression.type === "Literal") {
          if (directive.expression.value === "use strict") return true;
        } else {
          // Break for the first non literal expression
          break;
        }
      }
    }

    return false;
  }

  isValidDirective(stmt: N.Statement): boolean {
    return stmt.type === "ExpressionStatement" &&
      stmt.expression.type === "Literal" &&
      typeof stmt.expression.value === "string" &&
      (!stmt.expression.extra || !stmt.expression.extra.parenthesized);
  }

  stmtToDirective(stmt: N.Statement): N.Directive {
    const directive = super.stmtToDirective(stmt);
    const value = stmt.expression.value;

    // Reset value to the actual value as in estree mode we want
    // the stmt to have the real value and not the raw value
    directive.value.value = value;

    return directive;
  }

  parseBlockBody(
    node: N.BlockStatementLike,
    allowDirectives: ?boolean,
    topLevel: boolean,
    end: TokenType
  ): void {
    super.parseBlockBody(node, allowDirectives, topLevel, end);

    const directiveStatements = node.directives.map((d) => this.directiveToStmt(d));
    node.body = directiveStatements.concat(node.body);
    delete node.directives;
  }

  parseClassMethod(
    classBody: N.ClassBody,
    method: N.ClassMethod,
    isGenerator: boolean,
    isAsync: boolean
  ): void {
    this.parseMethod(method, isGenerator, isAsync);
    if (method.typeParameters) {
      // $FlowIgnore
      method.value.typeParameters = method.typeParameters;
      delete method.typeParameters;
    }
    classBody.body.push(this.finishNode(method, "MethodDefinition"));
  }

  parseExprAtom(refShorthandDefaultPos?: ?Pos): N.Expression {
    switch (this.state.type) {
      case tt.regexp:
        return this.estreeParseRegExpLiteral(this.state.value);

      case tt.num:
      case tt.string:
        return this.estreeParseLiteral(this.state.value);

      case tt._null:
        return this.estreeParseLiteral(null);

      case tt._true:
        return this.estreeParseLiteral(true);

      case tt._false:
        return this.estreeParseLiteral(false);

      default:
        return super.parseExprAtom(refShorthandDefaultPos);
    }
  }

  parseLiteral<T : N.Literal>(
    value: any,
    type: /*T["kind"]*/string,
    startPos?: number,
    startLoc?: Position
  ): T {
    const node = super.parseLiteral(value, type, startPos, startLoc);
    node.raw = node.extra.raw;
    delete node.extra;

    return node;
  }

  parseMethod(
    node: N.MethodLike,
    isGenerator?: boolean,
    isAsync?: boolean
  ): N.MethodLike {
    let funcNode = this.startNode();
    funcNode.kind = node.kind; // provide kind, so super method correctly sets state
    funcNode = super.parseMethod(funcNode, isGenerator, isAsync);
    delete funcNode.kind;
    // $FlowIgnore
    node.value = this.finishNode(funcNode, "FunctionExpression");

    return node;
  }

  parseObjectMethod(
    prop: N.ObjectMethod,
    isGenerator: boolean,
    isAsync: boolean,
    isPattern: boolean
  ): ?N.ObjectMethod {
    const node = super.parseObjectMethod(prop, isGenerator, isAsync, isPattern);

    if (node) {
      // $FlowIgnore
      if (node.kind === "method") node.kind = "init";
      // $FlowIgnore
      node.type = "Property";
    }

    return node;
  }

  parseObjectProperty(
    prop: N.ObjectProperty,
    startPos: ?number,
    startLoc: ?Position,
    isPattern: boolean,
    refShorthandDefaultPos: ?Pos
  ): ?N.ObjectProperty {
    const node = super.parseObjectProperty(prop, startPos, startLoc, isPattern, refShorthandDefaultPos);

    if (node) {
      // $FlowIgnore
      node.kind = "init";
      // $FlowIgnore
      node.type = "Property";
    }

    return node;
  }

  toAssignable(
    node: N.Node,
    isBinding: ?boolean,
    contextDescription: string
  ): N.Node {
    if (isSimpleProperty(node)) {
      this.toAssignable(node.value, isBinding, contextDescription);

      return node;
    } else if (node.type === "ObjectExpression") {
      node.type = "ObjectPattern";
      for (const prop of node.properties) {
        if (prop.kind === "get" || prop.kind === "set") {
          this.raise(prop.key.start, "Object pattern can't contain getter or setter");
        } else if (prop.method) {
          this.raise(prop.key.start, "Object pattern can't contain methods");
        } else {
          this.toAssignable(prop, isBinding, "object destructuring pattern");
        }
      }

      return node;
    }

    return super.toAssignable(node, isBinding, contextDescription);
  }
};
