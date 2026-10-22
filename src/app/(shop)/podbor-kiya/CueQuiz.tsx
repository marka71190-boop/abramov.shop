"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cueKey, defaultSelection, resolveCue, visibleGroups, type CueConfig } from "@/lib/cue-config";
import { rub } from "@/lib/format";
import { nearestOption, pickProducts, profileFor, QUIZ, type Answers, type QuizProduct } from "@/lib/quiz";
import { goal } from "@/lib/track";

export function CueQuiz({ products, cue }: { products: QuizProduct[]; cue: CueConfig | null }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);
  const done = step >= QUIZ.length;

  const choose = (qid: (typeof QUIZ)[number]["id"], aid: string) => {
    const next = { ...answers, [qid]: aid };
    setAnswers(next);
    setStep(step + 1);
    if (step + 1 === QUIZ.length) goal("quiz_done", { want: next.want, budget: next.budget });
  };

  if (!done) {
    const q = QUIZ[step];
    return (
      <div className="quiz">
        <div className="quiz__progress" aria-hidden>
          {QUIZ.map((x, i) => (
            <span key={x.id} className={i < step ? "is-done" : i === step ? "is-now" : ""} />
          ))}
        </div>
        <div className="quiz__step small muted">
          Вопрос {step + 1} из {QUIZ.length}
        </div>
        <h2 className="h3 quiz__q">{q.q}</h2>
        <div className="quiz__answers">
          {q.a.map((a) => (
            <button key={a.id} type="button" className={`quiz__a${answers[q.id] === a.id ? " is-on" : ""}`} onClick={() => choose(q.id, a.id)}>
              <b>{a.t}</b>
              {"d" in a && a.d && <span className="small muted">{a.d}</span>}
            </button>
          ))}
        </div>
        {step > 0 && (
          <button type="button" className="linklike small" onClick={() => setStep(step - 1)}>
            ← Назад
          </button>
        )}
      </div>
    );
  }
  return <QuizResult answers={answers} products={products} cue={cue} restart={() => (setAnswers({}), setStep(0))} />;
}

function QuizResult({ answers, products, cue, restart }: { answers: Answers; products: QuizProduct[]; cue: CueConfig | null; restart: () => void }) {
  const pr = useMemo(() => profileFor(answers), [answers]);
  const picks = useMemo(() => pickProducts(products, pr), [products, pr]);
  // «Чемпион» под эти параметры: ближайшие длина, вес, наклейка и конструкция из прайса конструктора
  const custom = useMemo(() => {
    if (!cue) return null;
    const sel = defaultSelection(cue);
    const groups = visibleGroups(cue);
    const g = (id: string) => groups.find((x) => x.id === id)?.options ?? [];
    const set = (id: "l" | "w" | "t", target: number) => {
      const o = nearestOption(g(id), target);
      if (o) sel[id] = o.id;
    };
    set("l", pr.length);
    set("w", (pr.weight[0] + pr.weight[1]) / 2);
    set("t", pr.tip);
    const c = g("c").find((o) => !o.hidden && o.name.includes(pr.construction.slice(-3)));
    if (c) sel.c = c.id;
    const r = resolveCue(cue, sel);
    return typeof r === "string" ? null : { key: cueKey(sel), price: r.price, days: cue.leadDays };
  }, [cue, pr]);
  const showCustom = custom && answers.want !== "ready";
  const showReady = answers.want !== "custom" || !custom;

  return (
    <div className="quiz-result">
      <div className="quiz-profile panel">
        <div className="label">Ваш кий</div>
        <div className="quiz-profile__nums">
          <div>
            <b>{pr.length}</b>
            <span>см длина</span>
          </div>
          <div>
            <b>
              {pr.weight[0]}–{pr.weight[1]}
            </b>
            <span>г вес</span>
          </div>
          <div>
            <b>{String(pr.tip).replace(".", ",")}</b>
            <span>мм наклейка</span>
          </div>
          <div>
            <b>{pr.construction.slice(-3)}</b>
            <span>разборный</span>
          </div>
        </div>
        <ul className="quiz-profile__why">
          {pr.why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <button type="button" className="linklike small" onClick={restart}>
          Пройти заново
        </button>
      </div>

      {showCustom && custom && (
        <div className="quiz-custom">
          <img src={`/cue/thumb?c=${encodeURIComponent(custom.key)}`} alt="" />
          <div className="stack" style={{ gap: 8 }}>
            <div className="label gold">Ручная работа</div>
            <h2 className="h3" style={{ margin: 0 }}>
              {cue!.title} под ваши параметры
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              Уже выставили длину, вес и наклейку. Осталось выбрать дерево, запилы и отделку. Изготовим за {custom.days} дн.
            </p>
            <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span>
                от <b className="gold">{rub(custom.price)}</b>
              </span>
              <Link href={`/cue?c=${encodeURIComponent(custom.key)}#builder`} className="btn btn--gold">
                Собрать свой кий
              </Link>
            </div>
          </div>
        </div>
      )}

      {showReady && (
        <div className="stack" style={{ gap: 16 }}>
          <h2 className="h3" style={{ margin: 0 }}>
            {picks.length ? "Подходят из каталога" : "Готовых киёв под эти параметры сейчас нет"}
          </h2>
          {picks.length > 0 ? (
            <div className="quiz-picks">
              {picks.map(({ p, score, hits }, i) => (
                <Link key={p.id} href={`/product/${p.slug}`} className="quiz-pick">
                  <div className="quiz-pick__img">
                    {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span className="ph" />}
                    {i === 0 && <span className="quiz-pick__best">Лучшее совпадение</span>}
                  </div>
                  <div className="quiz-pick__body">
                    <b>{p.name}</b>
                    <div className="quiz-pick__match">
                      <span className="quiz-pick__bar">
                        <span style={{ width: `${score}%` }} />
                      </span>
                      <span className="small">{score}%</span>
                    </div>
                    {hits.length > 0 && <div className="small muted">✓ {hits.join(" · ")}</div>}
                    <div className="quiz-pick__price">{rub(p.price)}</div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {custom ? "Зато можем сделать такой кий на заказ — смотрите выше. " : ""}
              Напишите нам в <Link href="/#support">поддержку</Link> — подберём вручную и подскажем, когда появится подходящий.
            </p>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            Сомневаетесь — напишите в <Link href="/#support">поддержку</Link>, подскажем. <Link href="/catalog">Весь каталог →</Link>
          </p>
        </div>
      )}
    </div>
  );
}
