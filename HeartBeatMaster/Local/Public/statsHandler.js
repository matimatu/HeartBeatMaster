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

export function getHeartRateMin(male) {
  if(String(male)==="1"){
    return 0.64;
  } else if(String(male)==="0"){
    return 0.76;
  }
  else
  {
    throw new Error("Invalid value for sex parameter: "+ male);
  }
}