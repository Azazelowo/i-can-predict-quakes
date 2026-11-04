/**
 * 通用統計工具：和地震、預言無關的純函式，方便單獨測試，也讓 src/modes/ 只描述「模式」本身。
 */
export { mulberry32 } from './random';
export { bisectDecreasing, garwoodInterval, poissonAtLeastOne, poissonCdf } from './poisson';
export { binomialPmf, logFactorials } from './binomial';
export { logit, sigmoid } from './logit';
export { blockBootstrapRatio, type BootstrapResult } from './bootstrap';
