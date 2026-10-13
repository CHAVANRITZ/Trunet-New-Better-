// utils/dateHelper.js
export const getMonthsBetweenDates = (startDate, endDate) => {
    const months = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const monthName = currentDate.toLocaleString('default', { month: 'long' });
      const lastDay = new Date(year, month + 1, 0).getDate();
      
      months.push({
        year,
        month: month + 1,
        monthName,
        startDate: new Date(year, month, 1),
        endDate: new Date(year, month, lastDay),
        lastDayOfMonth: new Date(year, month, lastDay)
      });
      
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    return months;
  };
  
  export const getCurrentMonthInfo = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthName = now.toLocaleString('default', { month: 'long' });
    const lastDay = new Date(year, month + 1, 0).getDate();
    
    return {
      year,
      month: month + 1,
      monthName,
      startDate: new Date(year, month, 1),
      endDate: new Date(year, month, lastDay),
      lastDayOfMonth: new Date(year, month, lastDay)
    };
  };
