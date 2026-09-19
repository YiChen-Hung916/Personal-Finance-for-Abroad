export const dict={
 'zh-TW':{dashboard:'Dashboard',newReceipt:'新增 Receipt',myConfirm:'我需要確認',waiting:'等待其他人確認',recent:'最近活動',viewAll:'查看全部',pendingAll:'所有未確認發票',history:'歷史紀錄',promos:'優惠紀錄',signout:'登出'},
 en:{dashboard:'Dashboard',newReceipt:'New Receipt',myConfirm:'My Confirmations',waiting:'Waiting for Others',recent:'Recent Activity',viewAll:'View All',pendingAll:'All Pending Receipts',history:'History',promos:'Promotion History',signout:'Sign Out'}
};
export function t(k,lang){return dict[lang]?.[k]||k}
