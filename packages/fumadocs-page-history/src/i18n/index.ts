import type { TranslationExtension, TranslationPreset } from 'fumadocs-core/i18n';
import translationKeys from '../.translations/keys.json';
import type { Translations } from '../.translations';

export type { Translations };

const translations = {
  'Page history(git changelog)': '页面历史',
  'Last edited(git changelog)': '最后编辑于',
  'View full history(git changelog)': '查看完整历史',
  'No history yet.(git changelog)': '暂无变更历史。',
  'Oldest first(git changelog)': '最早提交优先',
  'Newest first(git changelog)': '最新提交优先',
  'Contributors(git changelog)': '贡献者',
  'Commit details(git changelog)': '提交详情',
  'No contributors yet.(git changelog)': '暂无贡献者。',
  'Commits(git changelog)': '次提交',
  'Commit(git changelog)': '次提交',
  'Collapse history(git changelog)': '收起历史',
  'Page changes are unavailable. Reconnecting automatically.(git changelog)':
    '暂时无法读取页面差异，正在自动重连。',
  'Resolve merge conflicts to view page changes.(git changelog)':
    '请先解决合并冲突，再查看页面差异。',
  'This page cannot be compared inline.(git changelog)': '此页面无法显示正文差异。',
  'The page is updating. Changes will appear when it is ready.(git changelog)':
    '页面正在更新，完成后将显示差异。',
  'Uncommitted changes(git changelog)': '未提交修改',
  'Added(git changelog)': '新增',
  'Removed(git changelog)': '删除',
  'Page metadata changed(git changelog)': '页面元数据已修改',
  'Link target changed(git changelog)': '链接目标已修改',
  'Removed content(git changelog)': '已删除的内容',
  'Added content(git changelog)': '新增的内容',
} satisfies Translations;

export type GitChangelogTranslationKey = keyof Translations;
export function gitChangelogTranslations(): TranslationExtension<GitChangelogTranslationKey> {
  return { keys: translationKeys as GitChangelogTranslationKey[] };
}
export function zhCN(): TranslationPreset<GitChangelogTranslationKey> {
  return { name: 'zh-CN', value: translations };
}
