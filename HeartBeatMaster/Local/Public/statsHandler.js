import { Sex } from "./costantsHandler";
export function calcIntensity(hr, hrMax, hrRest) { 
  const hrr = hrMax - hrRest;
  const intensity = ((hr - hrRest) / hrr) * 100;
  return intensity.toFixed(2);
}

export function calcHeartRateMax(birthDate) {
  const age = calcAgeFromBirthDate(birthDate);
  return 208 -0.7*age;
}

export function calcAgeFromBirthDate(birthDate)
{
   const birthYear = new Date(birthDate).getFullYear();
  const currentYear = new Date().getFullYear();
  return currentYear - birthYear;
}
export function calcHeartRateMin(sex) {
  sex = sex.toLowerCase();
  if(sex === Sex.MALE){
    return 0.64;
  } else if(sex === Sex.FEMALE){
    return 0.76;
  }
  else
  {
    throw new Error("Invalid value for sex parameter: "+ sex);
  }
}

export function calcCaloriesBurnedPerTime(sex, weight, avgHeartRate, age,timeInMinutes) {
  let calories;
  sex = sex.toLowerCase();
  if( sex === Sex.MALE)
    calories = timeInMinutes*((-55.0969 + (0.6309 * avgHeartRate) + (0.1988 * weight) + (0.2017 * age)) / 4.184);
  else if (sex === Sex.FEMALE)
    calories = timeInMinutes*((-20.4022 + (0.4472 * avgHeartRate) - (0.1263 * weight) + (0.074 * age)) / 4.184);
  else
    throw new Error("Invalid value for sex parameter: "+ sex);
  return calories.toFixed(2);
}

export function calcAvgHeartRate(hrBuffer) {
  if (hrBuffer.length === 0) return 0;

  const sum = hrBuffer.reduce((acc, v) => acc + v.hr, 0);
  return Math.round(sum / hrBuffer.length);
}