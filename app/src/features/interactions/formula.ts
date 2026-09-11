/**
 * Winziger Formel-Auswerter für parameter_slider.
 *
 * WARUM NICHT eval() ODER new Function():
 * Die Formel kommt aus der Datenbank, geschrieben von einem Sprachmodell.
 * Sie als JavaScript auszuführen hiesse, jedem Pipeline-Fehler und jeder
 * kompromittierten Zeile in content_items vollen Zugriff auf die App zu
 * geben - inklusive des Supabase-Clients und damit der Sitzung des Nutzers.
 *
 * Dieser Parser kennt Zahlen, zwei Variablen, fünf Operatoren und sechs
 * Funktionen. Alles andere wirft. Das ist keine Einschränkung, sondern der
 * Zweck.
 *
 * Grammatik (rekursiver Abstieg, korrekte Präzedenz):
 *   expr   := term (('+' | '-') term)*
 *   term   := power (('*' | '/') power)*
 *   power  := unary ('^' power)?          rechtsassoziativ
 *   unary  := '-'? atom
 *   atom   := number | ident | func '(' expr (',' expr)* ')' | '(' expr ')'
 */

const FUNCS: Record<string, (...a: number[]) => number> = {
  exp: Math.exp,
  log: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
};

type Token = { kind: 'num'; value: number } | { kind: 'ident'; value: string } | { kind: 'op'; value: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (!Number.isFinite(n)) throw new Error(`ungültige Zahl bei ${i}`);
      out.push({ kind: 'num', value: n });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      out.push({ kind: 'ident', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/^(),'.includes(c)) {
      out.push({ kind: 'op', value: c });
      i++;
      continue;
    }
    throw new Error(`unerlaubtes Zeichen '${c}' bei ${i}`);
  }
  return out;
}

export type Scope = Record<string, number>;

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private scope: Scope,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private eat(op: string): boolean {
    const t = this.peek();
    if (t && t.kind === 'op' && t.value === op) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expect(op: string): void {
    if (!this.eat(op)) throw new Error(`'${op}' erwartet bei ${this.pos}`);
  }

  expr(): number {
    let left = this.term();
    for (;;) {
      if (this.eat('+')) left += this.term();
      else if (this.eat('-')) left -= this.term();
      else return left;
    }
  }

  private term(): number {
    let left = this.power();
    for (;;) {
      if (this.eat('*')) left *= this.power();
      else if (this.eat('/')) {
        const d = this.power();
        left = d === 0 ? NaN : left / d;
      } else return left;
    }
  }

  private power(): number {
    const base = this.unary();
    if (this.eat('^')) return Math.pow(base, this.power());
    return base;
  }

  private unary(): number {
    if (this.eat('-')) return -this.unary();
    return this.atom();
  }

  private atom(): number {
    const t = this.peek();
    if (!t) throw new Error('Ausdruck endet unerwartet');

    if (t.kind === 'num') {
      this.pos++;
      return t.value;
    }

    if (t.kind === 'ident') {
      this.pos++;
      const fn = FUNCS[t.value];
      if (fn) {
        this.expect('(');
        const args = [this.expr()];
        while (this.eat(',')) args.push(this.expr());
        this.expect(')');
        return fn(...args);
      }
      if (t.value in this.scope) return this.scope[t.value];
      throw new Error(`unbekannter Name '${t.value}'`);
    }

    if (t.kind === 'op' && t.value === '(') {
      this.pos++;
      const v = this.expr();
      this.expect(')');
      return v;
    }

    throw new Error(`unerwartetes Zeichen '${t.value}'`);
  }

  done(): boolean {
    return this.pos === this.tokens.length;
  }
}

/**
 * Wertet eine Formel aus. Gibt bei jedem Fehler NaN zurück statt zu werfen -
 * eine kaputte Formel in einer Karte darf den Feed nicht abstürzen lassen,
 * sie soll nur diese eine Kurve leer zeigen.
 */
export function evaluate(formula: string, scope: Scope): number {
  try {
    if (formula.length > 200) return NaN;
    const p = new Parser(tokenize(formula), scope);
    const value = p.expr();
    if (!p.done()) return NaN;
    return Number.isFinite(value) ? value : NaN;
  } catch {
    return NaN;
  }
}

/** Prüft einmalig, ob eine Formel überhaupt auswertbar ist. */
export function isValidFormula(formula: string, scope: Scope): boolean {
  return Number.isFinite(evaluate(formula, scope));
}
