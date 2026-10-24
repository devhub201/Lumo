/** Small arithmetic parser. Never executes JavaScript or accepts identifiers. */
export function calculate(expression: string): number {
  if (!expression.trim() || expression.length > 200 || /[^\d\s.+\-*/()%]/.test(expression))
    throw new Error("Use numbers, parentheses, and arithmetic operators only.");
  const tokens = expression.match(/\d*\.?\d+|[()+\-*/%]/g) ?? [];
  let i = 0;
  const atom = (): number => {
    const token = tokens[i++];
    if (token === "+") return atom();
    if (token === "-") return -atom();
    if (token === "(") {
      const value = sum();
      if (tokens[i++] !== ")") throw new Error("Check your parentheses.");
      return value;
    }
    if (!token || !/^\d*\.?\d+$/.test(token)) throw new Error("Enter a complete expression.");
    return Number(token);
  };
  const product = (): number => {
    let value = atom();
    while (["*", "/", "%"].includes(tokens[i] ?? "")) {
      const op = tokens[i++];
      const right = atom();
      if ((op === "/" || op === "%") && right === 0) throw new Error("Cannot divide by zero.");
      value = op === "*" ? value * right : op === "/" ? value / right : value % right;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++];
      const right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const result = sum();
  if (i !== tokens.length || !Number.isFinite(result))
    throw new Error("Enter a valid arithmetic expression.");
  return result;
}
