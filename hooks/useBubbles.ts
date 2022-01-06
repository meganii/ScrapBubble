/// <reference no-default-lib="true"/>
/// <reference lib="esnext"/>
/// <reference lib="dom"/>
import { useCallback, useMemo, useState } from "../deps/preact.tsx";
import { exposeState, toLc } from "../utils.ts";
import { getPage } from "../fetch.ts";
import type { LinkType, ScrollTo } from "../types.ts";
import type { Page, Scrapbox } from "../deps/scrapbox.ts";
declare const scrapbox: Scrapbox;

export type Position =
  & {
    top: number;
    bottom: number;
    maxWidth: number;
  }
  & ({
    left: number;
  } | {
    right: number;
  });

export interface UseBubblesInit {
  /** cacheの有効期限 (UNIX時刻) */ expired?: number;
  /** 透過的に扱いたいproject名のリスト */ whiteList?: string[];
}
export function useBubbles(
  { expired = 60, whiteList: _whiteList = [] }: UseBubblesInit,
) {
  const [
    /** 表示するデータのcache id のリストと表示位置とのペアのリスト */ selectedList,
    setSelectedList,
  ] = useState<
    {
      projects: string[];
      title: string;
      position: Position;
      scrollTo?: ScrollTo;
      type: LinkType;
    }[]
  >([]);

  // このリストにあるproject以外は表示しない
  const whiteList = useMemo(
    () => [...new Set([scrapbox.Project.name, ..._whiteList])],
    [_whiteList],
  );

  /** depth階層目にカードを表示する */
  const show = useCallback(
    (depth: number, project: string, title: string, options: {
      position: Position;
      scrollTo?: ScrollTo;
      type: LinkType;
    }) => {
      // whiteListにないprojectの場合は何もしない
      if (!whiteList.includes(project)) return;

      setSelectedList((
        list,
      ) => [...list.slice(0, depth), {
        // 指定されたprojectを最優先する
        projects: [project, ...whiteList.filter((proj) => proj !== project)],
        title,
        ...options,
      }]);
    },
    [whiteList],
  );

  /** depth階層以降のカードを消す */
  const hide = useCallback(
    (depth: number) => setSelectedList((list) => list.slice(0, depth)),
    [],
  );

  /** 表示するbubblesの情報を取得する函数
   *
   * 取得中の場合は`loading`が`true`になる
   */
  const getBubbles = useMemo(
    () => {
      // 以前の階層のtext bubbleで使ったページはcard bubbleに使わない
      // 現在表示しているページも同様
      const showedPages = [toLc(scrapbox.Page.title ?? "")];

      // ページデータを取得してbubblesを作る
      const tasks = selectedList.map(({ projects, title, ...options }) =>
        exposeState((async () => {
          const pages = await Promise.all(projects.map((
            project,
          ) => getPage(project, title, { expired })));

          // text bubbleで表示するページを決める
          const titleLc = toLc(title);
          const previewdPages = showedPages.includes(titleLc)
            ? []
            : pages.flatMap(({ persistent, title, lines }, i) =>
              persistent
                ? [{
                  project: projects[i],
                  title,
                  lines,
                }]
                : []
            );
          showedPages.push(titleLc);

          return {
            pages: previewdPages,
            cards: pages.flatMap((page, i) =>
              getBackLinks(page).flatMap(({ title, ...rest }) =>
                showedPages.includes(toLc(title)) ? [] : [{
                  title,
                  project: projects[i],
                  ...rest,
                }]
              )
            ),
            ...options,
          };
        })())
      );

      return () =>
        tasks.map((task) => {
          const promiseState = task();
          switch (promiseState.state) {
            case "pending":
              return { loading: true } as const;
            case "fulfilled":
              return { loading: false, ...promiseState.result } as const;
            case "rejected":
              throw promiseState.result;
          }
        });
    },
    [selectedList, expired],
  );

  return { getBubbles, show, hide };
}

/** 逆リンクを取得する */
function getBackLinks({ links, relatedPages: { links1hop } }: Page) {
  const linksLc = links.map((link) => toLc(link));
  return links1hop.flatMap((card) =>
    linksLc.includes(toLc(card.title)) ? [] : [card]
  );
}
