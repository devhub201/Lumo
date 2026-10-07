import {
  calculatorInputSchema,
  calculatorOutputSchema,
  type CalculatorInput,
  type CalculatorOutput,
} from "./contracts";

class CalculatorFault extends Error {
  readonly code = "validation_error";
  readonly retryable = false;
}

type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "^" | "%" }
  | { type: "paren"; value: "(" | ")" }
  | { type: "identifier"; value: string };

const fail = (message: string): never => {
  throw new CalculatorFault(message);
};

const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const tokenMatch = source
      .slice(index)
      .match(
        /^\s*(?:(\d+(?:\.\d*)?|\.\d+)|([()+\-*\/%^])|([A-Za-z_][A-Za-z0-9_]*))/
      );
    if (!tokenMatch)
      return fail("The expression contains an unsupported token.");
    const match = tokenMatch as RegExpMatchArray;
    index += match[0].length;
    if (match[1]) {
      const value = Number(match[1]);
      if (!Number.isFinite(value))
        fail("The number is outside the supported range.");
      tokens.push({ type: "number", value });
    } else if (match[2]) {
      const value = match[2];
      if (value === "(" || value === ")") tokens.push({ type: "paren", value });
      else tokens.push({ type: "operator", value: value as Token & never });
    } else if (match[3]) {
      tokens.push({ type: "identifier", value: match[3].toLowerCase() });
    }
    if (tokens.length > 100) fail("The expression is too complex.");
  }
  return tokens;
};

class Parser {
  private position = 0;
  constructor(private readonly tokens: Token[]) {}

  parse() {
    const value = this.additive();
    if (this.position !== this.tokens.length)
      fail("The expression syntax is invalid.");
    return this.finish(value);
  }

  private current() {
    return this.tokens[this.position];
  }

  private matchOperator(value: Token["value"]) {
    const token = this.current();
    if (token?.type === "operator" && token.value === value) {
      this.position += 1;
      return true;
    }
    return false;
  }

  private additive(): number {
    let value = this.multiplicative();
    while (true) {
      if (this.matchOperator("+")) value += this.multiplicative();
      else if (this.matchOperator("-")) value -= this.multiplicative();
      else return this.finish(value);
      this.finish(value);
    }
  }

  private multiplicative(): number {
    let value = this.power();
    while (true) {
      if (this.matchOperator("*")) value *= this.power();
      else if (this.matchOperator("/")) {
        const divisor = this.power();
        if (divisor === 0) fail("Division by zero is not allowed.");
        value /= divisor;
      } else return this.finish(value);
      this.finish(value);
    }
  }

  private power(): number {
    const base = this.unary();
    if (!this.matchOperator("^")) return this.finish(base);
    const exponent = this.power();
    if (Math.abs(exponent) > 1000)
      fail("The exponent is outside the supported range.");
    return this.finish(Math.pow(base, exponent));
  }

  private unary(): number {
    if (this.matchOperator("+")) return this.unary();
    if (this.matchOperator("-")) return this.finish(-this.unary());
    return this.postfix();
  }

  private postfix(): number {
    let value = this.primary();
    while (this.matchOperator("%")) value /= 100;
    return this.finish(value);
  }

  private primary(): number {
    const token = this.current();
    if (!token) fail("The expression is incomplete.");
    if (token.type === "number") {
      this.position += 1;
      return token.value;
    }
    if (token.type === "identifier") {
      this.position += 1;
      if (token.value !== "sqrt") fail("Only the sqrt function is supported.");
      if (!this.consumeParen("("))
        fail("sqrt must be called with parentheses.");
      const value = this.additive();
      if (value < 0) fail("sqrt cannot operate on a negative value.");
      if (!this.consumeParen(")"))
        fail("The sqrt call is missing a closing parenthesis.");
      return Math.sqrt(value);
    }
    if (this.consumeParen("(")) {
      const value = this.additive();
      if (!this.consumeParen(")"))
        fail("The expression is missing a closing parenthesis.");
      return value;
    }
    return fail("The expression syntax is invalid.");
  }

  private consumeParen(value: "(" | ")") {
    const token = this.current();
    if (token?.type === "paren" && token.value === value) {
      this.position += 1;
      return true;
    }
    return false;
  }

  private finish(value: number) {
    if (!Number.isFinite(value))
      fail("The calculation exceeded the supported numeric range.");
    return value;
  }
}

const normalizePercentageOf = (expression: string) => {
  const match = expression.match(/^\s*(.+?)\s+of\s+(.+?)\s*$/i);
  if (!match || !/%\s*$/.test(match[1])) return expression;
  return `(${match[1].replace(/%\s*$/, "")}/100)*(${match[2]})`;
};

export const calculate = (input: CalculatorInput): CalculatorOutput => {
  const parsed = calculatorInputSchema.parse(input);
  const expression = parsed.expression;
  const normalized = normalizePercentageOf(expression);
  const value = new Parser(tokenize(normalized)).parse();
  return calculatorOutputSchema.parse({ expression, value });
};
