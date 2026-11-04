/**
 * 進入點：載入樣式、啟動 app（狀態與畫面在 src/app/controller.ts）。
 */
import './ui/styles.css';
import { startApp } from './app/controller';

const root = document.querySelector<HTMLElement>('#app');
if (root) startApp(root);
