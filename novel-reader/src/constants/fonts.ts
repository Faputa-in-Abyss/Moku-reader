import React from "react";

export interface FontOption {
  value: string;
  label: string;
}

export const FONT_LIST: FontOption[] = [
  { value: '', label: '默认衬线' },
  { value: "'HarmonyOS Sans SC','Microsoft YaHei',sans-serif", label: '鸿蒙字体' },
  { value: "'Noto Serif CJK SC','STSong','SimSun',serif", label: '思源宋体' },
  { value: "'LXGW WenKai','KaiTi','STKaiti',serif", label: '霞鹜文楷' },
  { value: "'LXGW ZhenKai','KaiTi','STKaiti',serif", label: '霞鹜珠楷' },
  { value: "'Xiangcui Dengcusong','STSong','SimSun',serif", label: '香萃等粗宋' },
  { value: "'Smiley Sans',sans-serif", label: '得意黑' },
  { value: "'LXGW Marker Gothic',sans-serif", label: '霞鹜漫黑' },
  { value: "'Ma Shan Zheng','KaiTi',serif", label: '马善政楷书' },
  { value: "'Liu Jian Mao Cao',cursive", label: '柳建毛草体' },
  { value: "'ZCOOL XiaoWei','FangSong','STFangsong',serif", label: '站酷小魏体' },
  { value: "'ZCOOL QingKe HuangYou',sans-serif", label: '站酷清刻黄油体' },
  { value: "'ZCOOL KuaiLe',sans-serif", label: '站酷快乐体' },
  // Windows 系统内置字体
  { value: "'Microsoft YaHei',sans-serif", label: '微软雅黑' },
  { value: "'SimSun',serif", label: '宋体' },
  { value: "'STSong','SimSun',serif", label: '华文宋体' },
  { value: "'KaiTi','STKaiti',serif", label: '楷体' },
  { value: "'FangSong','STFangsong',serif", label: '仿宋' },
  { value: "'DengXian',sans-serif", label: '等线' },
];

/** Reader.tsx uses shorter labels for narrow toolbar */
export const FONT_LIST_SHORT: FontOption[] = [
  { value: '', label: '默认衬线' },
  { value: "'HarmonyOS Sans SC','Microsoft YaHei',sans-serif", label: '鸿蒙字体' },
  { value: "'Noto Serif CJK SC','STSong','SimSun',serif", label: '思源宋体' },
  { value: "'LXGW WenKai','KaiTi','STKaiti',serif", label: '霞鹜文楷' },
  { value: "'LXGW ZhenKai','KaiTi','STKaiti',serif", label: '霞鹜珠楷' },
  { value: "'Xiangcui Dengcusong','STSong','SimSun',serif", label: '香萃等粗宋' },
  { value: "'Smiley Sans',sans-serif", label: '得意黑' },
  { value: "'LXGW Marker Gothic',sans-serif", label: '霞鹜漫黑' },
  { value: "'Ma Shan Zheng','KaiTi',serif", label: '马善政楷书' },
  { value: "'Liu Jian Mao Cao',cursive", label: '柳建毛草体' },
  { value: "'ZCOOL XiaoWei','FangSong','STFangsong',serif", label: '站酷小魏体' },
  { value: "'ZCOOL QingKe HuangYou',sans-serif", label: '站酷清刻黄油体' },
  { value: "'ZCOOL KuaiLe',sans-serif", label: '站酷快乐体' },
  // Windows 系统内置字体
  { value: "'Microsoft YaHei',sans-serif", label: '微软雅黑' },
  { value: "'SimSun',serif", label: '宋体' },
  { value: "'STSong','SimSun',serif", label: '华文宋体' },
  { value: "'KaiTi','STKaiti',serif", label: '楷体' },
  { value: "'FangSong','STFangsong',serif", label: '仿宋' },
  { value: "'DengXian',sans-serif", label: '等线' },
];

/** DebugPanel font settings uses shorter labels */
export const FONT_OPTIONS: FontOption[] = [
  { value: "", label: "默认衬线" },
  { value: "'HarmonyOS Sans SC','Microsoft YaHei',sans-serif", label: "鸿蒙字体" },
  { value: "'Noto Serif CJK SC','STSong','SimSun',serif", label: "思源宋体" },
  { value: "'LXGW WenKai','KaiTi','STKaiti',serif", label: "霞鹜文楷" },
  { value: "'LXGW ZhenKai','KaiTi','STKaiti',serif", label: "霞鹜珠楷" },
  { value: "'Xiangcui Dengcusong','STSong','SimSun',serif", label: "香萃等粗宋" },
  { value: "'Smiley Sans',sans-serif", label: "得意黑" },
  { value: "'LXGW Marker Gothic',sans-serif", label: "霞鹜漫黑" },
  { value: "'Ma Shan Zheng','KaiTi',serif", label: "马善政楷书" },
  { value: "'Liu Jian Mao Cao',cursive", label: "柳建毛草体" },
  { value: "'ZCOOL XiaoWei','FangSong','STFangsong',serif", label: "站酷小魏体" },
  { value: "'ZCOOL QingKe HuangYou',sans-serif", label: "站酷清刻黄油体" },
  { value: "'ZCOOL KuaiLe',sans-serif", label: "站酷快乐体" },
  // Windows 系统内置字体
  { value: "'Microsoft YaHei',sans-serif", label: "微软雅黑" },
  { value: "'SimSun',serif", label: "宋体" },
  { value: "'STSong','SimSun',serif", label: "华文宋体" },
  { value: "'KaiTi','STKaiti',serif", label: "楷体" },
  { value: "'FangSong','STFangsong',serif", label: "仿宋" },
  { value: "'DengXian',sans-serif", label: "等线" },
];

export const FONT_SIZES = [
  { value: ".5rem", label: "八号" },    { value: ".55rem", label: "七号" },
  { value: ".63rem", label: "小六" },   { value: ".7rem",  label: "六号" },
  { value: ".75rem", label: "小五" },   { value: ".8rem",  label: "五号" },
  { value: ".88rem", label: "小四" },   { value: ".94rem", label: "四号" },
  { value: "1rem",   label: "小三" },   { value: "1.06rem",label: "三号" },
  { value: "1.2rem", label: "小二号" }, { value: "1.38rem",label: "二号" },
  { value: "1.5rem", label: "小一号" }, { value: "1.75rem",label: "一号" },
];
