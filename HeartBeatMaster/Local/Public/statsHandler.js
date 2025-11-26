export function calcIntensity(hr, hrMax, hrRest) {
  const hrr = hrMax - hrRest;
  const intensity = ((hr - hrRest) / hrr) * 100;
  return intensity.toFixed(2);
}

export function calcHeartRateMax(bornDate) {
  const birthYear = new Date(bornDate).getFullYear();
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;
  return 208 -0.7*age;
}

export function calcHeartRateMin(sex) {
  sex = sex.toLowerCase();
  if(sex === "male"){
    return 0.64;
  } else if(sex === "female"){
    return 0.76;
  }
  else
  {
    throw new Error("Invalid value for sex parameter: "+ sex);
  }
}

export function calcCaloriesBurnedPerMin(sex,weightKg, avgHeartRate, age) {
  let calories;
  sex = sex.toLowerCase();
  if( sex === "male")
    calories = ((-55.0969 + (0.6309 * avgHeartRate) + (0.1988 * weightKg) + (0.2017 * age)) / 4.184);
  else if (sex === "female")
    calories = ((-20.4022 + (0.4472 * avgHeartRate) - (0.1263 * weightKg) + (0.074 * age)) / 4.184);
  else
    throw new Error("Invalid value for sex parameter: "+ sex);
  return calories.toFixed(2);
}

export function calcAvgHeartRate(dataPoints) {
 //TODO
}